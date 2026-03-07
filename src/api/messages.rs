use poem::{web::{Data, Query}, Result, error::InternalServerError};
use poem_openapi::{OpenApi, payload::Json, param::{Path, Header}};
use crate::{db::AppState, models::{MessagePayload, MessageEvent}, api::utils::decode_user_id_from_token};
use futures_util::StreamExt;
use tokio_stream::wrappers::BroadcastStream;
use uuid::Uuid;
use poem::web::sse::Event;
use serde::{Deserialize, Serialize};
use poem_openapi::Object;

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
