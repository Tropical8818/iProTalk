use poem::{web::{Data, Query}, Result, error::InternalServerError};
use poem_openapi::{OpenApi, payload::Json, param::{Path, Header}};
use crate::{db::AppState, models::{MessagePayload, MessageEvent}, api::utils::decode_user_id_from_token};
use futures_util::StreamExt;
use tokio_stream::wrappers::BroadcastStream;
use uuid::Uuid;
use poem::web::sse::Event;
use serde::{Deserialize, Serialize};
use poem_openapi::Object;
use sqlx::Row;

#[derive(Debug, Object, Serialize, Deserialize, Clone)]
pub struct PinnedMessage {
    pub id: String,
    pub channel_id: Option<String>,
    pub pinned_by: String,
    pub content: String,
    pub pinned_at: String,
}

#[derive(Debug, Object, Deserialize)]
pub struct PinRequest {
    pub message_id: String,
    pub channel_id: Option<String>,
    pub content: String, // serialized JSON of original message
}

#[derive(Debug, Object, Deserialize)]
pub struct ForwardRequest {
    pub content: String,       // original content text / encrypted blob
    pub target_channel_id: Option<String>,
    pub target_user_id: Option<String>,
}

#[derive(Deserialize)]
pub struct SearchQuery {
    pub q: String,
    pub channel_id: Option<String>,
    pub limit: Option<usize>,
}


#[derive(Clone, Default)]
pub struct MessagesApi;

#[derive(Debug, Object, Serialize, Deserialize)]
pub struct StoredMessage {
    pub id: String,
    pub timestamp: i64,
    pub payload: MessagePayload,
}

#[derive(Deserialize)]
pub struct HistoryQuery {
    pub limit: Option<i64>,
}

#[OpenApi]
impl MessagesApi {
    /// 发送群组/频道消息
    #[oai(path = "/messages/group/:gid", method = "post")]
    async fn send_group_message(
        &self,
        state: Data<&AppState>,
        gid: Path<String>,
        req: Json<MessagePayload>,
        #[oai(name = "Authorization")] auth_header: Header<Option<String>>,
    ) -> Result<Json<String>> {
        let token = auth_header.0.ok_or(poem::Error::from_string("Missing Auth Token", poem::http::StatusCode::FORBIDDEN))?;
        let _user_id = decode_user_id_from_token(&token)
            .map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::FORBIDDEN))?;

        let msg_id = Uuid::new_v4().to_string();
        let timestamp = chrono::Utc::now().timestamp();

        // 存储到 Sled（key格式: group:{gid}:ts:{timestamp}:{msg_id}）
        let key = format!("group:{}:ts:{:020}:{}", gid.0, timestamp, msg_id);
        let stored = StoredMessage {
            id: msg_id.clone(),
            timestamp,
            payload: req.0.clone(),
        };
        let value = serde_json::to_vec(&stored).map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::INTERNAL_SERVER_ERROR))?;
        state.msg_db.insert(key, value).map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::INTERNAL_SERVER_ERROR))?;

        let event = MessageEvent {
            event_type: "new_message".to_string(),
            payload: req.0.clone(),
            timestamp,
        };
        let _ = state.sender.send(event);
        Ok(Json(msg_id))
    }

    /// 获取频道历史消息
    #[oai(path = "/messages/group/:gid/history", method = "get")]
    async fn get_group_history(
        &self,
        state: Data<&AppState>,
        gid: Path<String>,
        Query(params): Query<HistoryQuery>,
        #[oai(name = "Authorization")] auth_header: Header<Option<String>>,
    ) -> Result<Json<Vec<StoredMessage>>> {
        let _token = auth_header.0.ok_or(poem::Error::from_string("Missing Auth Token", poem::http::StatusCode::FORBIDDEN))?;

        let limit = params.limit.unwrap_or(50) as usize;
        let prefix = format!("group:{}:ts:", gid.0);

        let mut messages: Vec<StoredMessage> = state.msg_db
            .scan_prefix(prefix.as_bytes())
            .filter_map(|r| r.ok())
            .filter_map(|(_, v)| serde_json::from_slice::<StoredMessage>(&v).ok())
            .collect();

        // 按时间戳降序，取最新 limit 条，再转回升序
        messages.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
        messages.truncate(limit);
        messages.reverse();

        Ok(Json(messages))
    }

    /// 发送私信（DM）
    #[oai(path = "/messages/dm/:uid", method = "post")]
    async fn send_dm(
        &self,
        state: Data<&AppState>,
        uid: Path<String>, // 目标用户ID
        req: Json<MessagePayload>,
        #[oai(name = "Authorization")] auth_header: Header<Option<String>>,
    ) -> Result<Json<String>> {
        let token = auth_header.0.ok_or(poem::Error::from_string("Missing Auth Token", poem::http::StatusCode::FORBIDDEN))?;
        let sender_id = decode_user_id_from_token(&token)
            .map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::FORBIDDEN))?;

        let msg_id = Uuid::new_v4().to_string();
        let timestamp = chrono::Utc::now().timestamp();

        // DM存储用排序后的两个uid保证双向查询一致
        let mut pair = vec![sender_id.clone(), uid.0.clone()];
        pair.sort();
        let dm_key_prefix = format!("dm:{}:{}:ts:{:020}:{}", pair[0], pair[1], timestamp, msg_id);

        let stored = StoredMessage {
            id: msg_id.clone(),
            timestamp,
            payload: req.0.clone(),
        };
        let value = serde_json::to_vec(&stored).map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::INTERNAL_SERVER_ERROR))?;
        state.msg_db.insert(dm_key_prefix, value).map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::INTERNAL_SERVER_ERROR))?;

        let event = MessageEvent {
            event_type: "dm_message".to_string(),
            payload: req.0.clone(),
            timestamp,
        };
        let _ = state.sender.send(event);
        Ok(Json(msg_id))
    }

    /// 获取私信历史
    #[oai(path = "/messages/dm/:uid/history", method = "get")]
    async fn get_dm_history(
        &self,
        state: Data<&AppState>,
        uid: Path<String>,
        Query(params): Query<HistoryQuery>,
        #[oai(name = "Authorization")] auth_header: Header<Option<String>>,
    ) -> Result<Json<Vec<StoredMessage>>> {
        let token = auth_header.0.ok_or(poem::Error::from_string("Missing Auth Token", poem::http::StatusCode::FORBIDDEN))?;
        let my_id = decode_user_id_from_token(&token)
            .map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::FORBIDDEN))?;

        let mut pair = vec![my_id.clone(), uid.0.clone()];
        pair.sort();
        let prefix = format!("dm:{}:{}:ts:", pair[0], pair[1]);
        let limit = params.limit.unwrap_or(50) as usize;

        let mut messages: Vec<StoredMessage> = state.msg_db
            .scan_prefix(prefix.as_bytes())
            .filter_map(|r| r.ok())
            .filter_map(|(_, v)| serde_json::from_slice::<StoredMessage>(&v).ok())
            .collect();

        messages.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
        messages.truncate(limit);
        messages.reverse();

        Ok(Json(messages))
    }

    /// 编辑消息
    #[oai(path = "/messages/:mid/edit", method = "put")]
    async fn edit_message(
        &self,
        state: Data<&AppState>,
        mid: Path<String>,
        req: Json<MessagePayload>,
        #[oai(name = "Authorization")] auth_header: Header<Option<String>>,
    ) -> Result<Json<String>> {
        let _token = auth_header.0.ok_or(poem::Error::from_string("Missing Auth Token", poem::http::StatusCode::FORBIDDEN))?;

        let event = MessageEvent {
            event_type: "edit_message".to_string(),
            payload: req.0.clone(),
            timestamp: chrono::Utc::now().timestamp(),
        };
        let _ = state.sender.send(event);
        Ok(Json(format!("Edited {}", mid.0)))
    }

    /// 删除消息
    #[oai(path = "/messages/:mid", method = "delete")]
    async fn delete_message(
        &self,
        state: Data<&AppState>,
        mid: Path<String>,
        #[oai(name = "Authorization")] auth_header: Header<Option<String>>,
    ) -> Result<Json<String>> {
        let _token = auth_header.0.ok_or(poem::Error::from_string("Missing Auth Token", poem::http::StatusCode::FORBIDDEN))?;

        let dummy_payload = MessagePayload {
            encrypted_blob: mid.0.clone(),
            nonce: "".to_string(),
            sender_id: "".to_string(),
            group_id: None,
            recipient_id: None,
            recipient_keys: std::collections::HashMap::new(),
        };

        let event = MessageEvent {
            event_type: "delete_message".to_string(),
            payload: dummy_payload,
            timestamp: chrono::Utc::now().timestamp(),
        };
        let _ = state.sender.send(event);
        Ok(Json("Deleted".to_string()))
    }

    /// 置顶消息（Pin）
    #[oai(path = "/messages/pin", method = "post")]
    async fn pin_message(
        &self,
        state: Data<&AppState>,
        req: Json<PinRequest>,
        #[oai(name = "Authorization")] auth_header: Header<Option<String>>,
    ) -> Result<Json<String>> {
        let token = auth_header.0.ok_or(poem::Error::from_string("Missing Auth Token", poem::http::StatusCode::FORBIDDEN))?;
        let user_id = decode_user_id_from_token(&token)
            .map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::FORBIDDEN))?;

        sqlx::query(
            "INSERT OR REPLACE INTO pinned_messages (id, channel_id, pinned_by, content) VALUES (?, ?, ?, ?)"
        )
        .bind(&req.0.message_id)
        .bind(&req.0.channel_id)
        .bind(&user_id)
        .bind(&req.0.content)
        .execute(&state.sql_pool)
        .await
        .map_err(InternalServerError)?;

        Ok(Json("Pinned".to_string()))
    }

    /// 取消置顶（Unpin）
    #[oai(path = "/messages/pin/:mid", method = "delete")]
    async fn unpin_message(
        &self,
        state: Data<&AppState>,
        mid: Path<String>,
        #[oai(name = "Authorization")] auth_header: Header<Option<String>>,
    ) -> Result<Json<String>> {
        let _token = auth_header.0.ok_or(poem::Error::from_string("Missing Auth Token", poem::http::StatusCode::FORBIDDEN))?;

        sqlx::query("DELETE FROM pinned_messages WHERE id = ?")
            .bind(&mid.0)
            .execute(&state.sql_pool)
            .await
            .map_err(InternalServerError)?;

        Ok(Json("Unpinned".to_string()))
    }

    /// 获取频道的置顶消息
    #[oai(path = "/messages/pin/channel/:cid", method = "get")]
    async fn get_pinned_messages(
        &self,
        state: Data<&AppState>,
        cid: Path<String>,
        #[oai(name = "Authorization")] auth_header: Header<Option<String>>,
    ) -> Result<Json<Vec<PinnedMessage>>> {
        let _token = auth_header.0.ok_or(poem::Error::from_string("Missing Auth Token", poem::http::StatusCode::FORBIDDEN))?;

        let rows = sqlx::query(
            "SELECT id, channel_id, pinned_by, content, pinned_at FROM pinned_messages WHERE channel_id = ? ORDER BY pinned_at DESC"
        )
        .bind(&cid.0)
        .fetch_all(&state.sql_pool)
        .await
        .map_err(InternalServerError)?;

        let pins: Vec<PinnedMessage> = rows.iter().map(|r| PinnedMessage {
            id: r.get("id"),
            channel_id: r.try_get("channel_id").ok(),
            pinned_by: r.get("pinned_by"),
            content: r.get("content"),
            pinned_at: r.get::<String, _>("pinned_at"),
        }).collect();

        Ok(Json(pins))
    }

    /// 转发消息
    #[oai(path = "/messages/forward", method = "post")]
    async fn forward_message(
        &self,
        state: Data<&AppState>,
        req: Json<ForwardRequest>,
        #[oai(name = "Authorization")] auth_header: Header<Option<String>>,
    ) -> Result<Json<String>> {
        let token = auth_header.0.ok_or(poem::Error::from_string("Missing Auth Token", poem::http::StatusCode::FORBIDDEN))?;
        let sender_id = decode_user_id_from_token(&token)
            .map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::FORBIDDEN))?;

        let msg_id = Uuid::new_v4().to_string();
        let timestamp = chrono::Utc::now().timestamp();

        let payload = MessagePayload {
            encrypted_blob: req.0.content.clone(),
            nonce: "forwarded".to_string(),
            sender_id: sender_id.clone(),
            group_id: req.0.target_channel_id.clone(),
            recipient_id: req.0.target_user_id.clone(),
            recipient_keys: std::collections::HashMap::new(),
        };

        // Store in sled
        if let Some(ref cid) = req.0.target_channel_id {
            let key = format!("group:{}:ts:{:020}:{}", cid, timestamp, msg_id);
            let stored = crate::api::messages::StoredMessage { id: msg_id.clone(), timestamp, payload: payload.clone() };
            let value = serde_json::to_vec(&stored).map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::INTERNAL_SERVER_ERROR))?;
            state.msg_db.insert(key, value).map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::INTERNAL_SERVER_ERROR))?;
        }

        let event = MessageEvent {
            event_type: "new_message".to_string(),
            payload,
            timestamp,
        };
        let _ = state.sender.send(event);
        Ok(Json(msg_id))
    }

    /// 搜索消息（按关键字在频道中）
    #[oai(path = "/messages/search", method = "get")]
    async fn search_messages(
        &self,
        state: Data<&AppState>,
        Query(params): Query<SearchQuery>,
        #[oai(name = "Authorization")] auth_header: Header<Option<String>>,
    ) -> Result<Json<Vec<StoredMessage>>> {
        let _token = auth_header.0.ok_or(poem::Error::from_string("Missing Auth Token", poem::http::StatusCode::FORBIDDEN))?;

        let limit = params.limit.unwrap_or(30);
        let q = params.q.to_lowercase();
        let prefix = match &params.channel_id {
            Some(cid) => format!("group:{}:ts:", cid),
            None => "group:".to_string(),
        };

        let results: Vec<StoredMessage> = state.msg_db
            .scan_prefix(prefix.as_bytes())
            .filter_map(|r| r.ok())
            .filter_map(|(_, v)| serde_json::from_slice::<StoredMessage>(&v).ok())
            .filter(|m| m.payload.encrypted_blob.to_lowercase().contains(&q))
            .take(limit)
            .collect();

        Ok(Json(results))
    }
}

#[poem::handler]
pub async fn sse_handler(
    state: Data<&AppState>,
) -> poem::web::sse::SSE {
    let rx = state.sender.subscribe();

    let stream = BroadcastStream::new(rx).map(|msg| {
        match msg {
            Ok(event) => {
                let json = serde_json::to_string(&event).unwrap_or_default();
                Event::message(json)
            }
            Err(_) => Event::message("{\"error\": \"lagged\"}")
        }
    });

    poem::web::sse::SSE::new(stream).keep_alive(std::time::Duration::from_secs(10))
}
