use poem::{web::{Data, Query}, Result, error::InternalServerError};
use poem_openapi::{OpenApi, payload::Json, param::{Path, Header}};
use crate::{db::AppState, models::{ForwardInfo, MessagePayload, RealtimeEvent}, api::utils::decode_user_id_from_token};
use futures_util::StreamExt;
use tokio_stream::wrappers::BroadcastStream;
use uuid::Uuid;
use poem::web::sse::Event;
use serde::{Deserialize, Serialize};
use poem_openapi::Object;
use sqlx::Row;
use std::collections::HashMap;

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
    pub message_ids: Vec<String>,
    pub target_type: String, // "user" | "channel" | "group"
    pub target_id: String,
}

#[derive(Debug, Object, Deserialize)]
pub struct ForwardCombinedRequest {
    pub message_ids: Vec<String>,
    pub target_type: String, // "user" | "channel" | "group"
    pub target_id: String,
}

#[derive(Deserialize)]
pub struct SearchQuery {
    pub q: String,
    pub channel_id: Option<String>,
    pub limit: Option<usize>,
}


#[derive(Debug, Object, Serialize, Deserialize)]
pub struct StoredMessage {
    pub id: String,
    pub timestamp: i64,
    pub payload: MessagePayload,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reply_to: Option<String>,         // ID of the message being replied to
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reply_to_preview: Option<String>, // Quoted preview of the replied message
}

#[derive(Deserialize)]
pub struct HistoryQuery {
    pub limit: Option<i64>,
}

#[derive(Clone, Default)]
pub struct MessagesApi;

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

        let stored = StoredMessage {
            id: msg_id.clone(),
            timestamp,
            payload: req.0.clone(),
            reply_to: req.0.reply_to.clone(),
            reply_to_preview: req.0.reply_to_preview.clone(),
        };
        let key = format!("group:{}:ts:{:020}:{}", gid.0, timestamp, msg_id);
        let value = serde_json::to_vec(&stored).map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::INTERNAL_SERVER_ERROR))?;
        state.msg_db.insert(key.as_bytes(), value).map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::INTERNAL_SERVER_ERROR))?;
        // Secondary index: msg_idx:{id} -> primary key, for edit/delete lookup
        let idx_key = format!("msg_idx:{}", msg_id);
        state.msg_db.insert(idx_key.as_bytes(), key.as_bytes()).map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::INTERNAL_SERVER_ERROR))?;

        // 存储@提及记录到数据库
        for uid in &req.0.mentions {
            if let Err(e) = sqlx::query(
                "INSERT OR IGNORE INTO message_mentions (message_id, mentioned_user_id, channel_id) VALUES (?, ?, ?)"
            )
            .bind(&msg_id)
            .bind(uid)
            .bind(&gid.0)
            .execute(&state.sql_pool)
            .await
            {
                tracing::warn!("Failed to record mention for message {}: {}", msg_id, e);
            }
        }

        let event = RealtimeEvent::NewMessage { payload: req.0.clone(), timestamp };
        let _ = state.sender.send(event);

        // Broadcast mention events for each @mentioned user
        for mentioned_uid in &req.0.mentions {
            let mention_event = RealtimeEvent::Mention {
                message_id: msg_id.clone(),
                sender_id: req.0.sender_id.clone(),
                mentioned_user_id: mentioned_uid.clone(),
                channel_id: Some(gid.0.clone()),
                timestamp,
            };
            let _ = state.sender.send(mention_event);
        }

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
            reply_to: req.0.reply_to.clone(),
            reply_to_preview: req.0.reply_to_preview.clone(),
        };
        let value = serde_json::to_vec(&stored).map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::INTERNAL_SERVER_ERROR))?;
        state.msg_db.insert(dm_key_prefix.as_bytes(), value).map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::INTERNAL_SERVER_ERROR))?;
        // Secondary index: msg_idx:{id} -> primary key, for edit/delete lookup
        let idx_key = format!("msg_idx:{}", msg_id);
        state.msg_db.insert(idx_key.as_bytes(), dm_key_prefix.as_bytes()).map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::INTERNAL_SERVER_ERROR))?;

        // 存储@提及记录到数据库
        for uid_mention in &req.0.mentions {
            if let Err(e) = sqlx::query(
                "INSERT OR IGNORE INTO message_mentions (message_id, mentioned_user_id) VALUES (?, ?)"
            )
            .bind(&msg_id)
            .bind(uid_mention)
            .execute(&state.sql_pool)
            .await
            {
                tracing::warn!("Failed to record DM mention for message {}: {}", msg_id, e);
            }
        }

        let event = RealtimeEvent::DmMessage { payload: req.0.clone(), timestamp };
        let _ = state.sender.send(event);

        // Broadcast mention events for each @mentioned user in DM
        for mentioned_uid in &req.0.mentions {
            let mention_event = RealtimeEvent::Mention {
                message_id: msg_id.clone(),
                sender_id: req.0.sender_id.clone(),
                mentioned_user_id: mentioned_uid.clone(),
                channel_id: None,
                timestamp,
            };
            let _ = state.sender.send(mention_event);
        }

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

        let timestamp = chrono::Utc::now().timestamp();

        // Look up the primary key via secondary index
        let idx_key = format!("msg_idx:{}", mid.0);
        if let Ok(Some(primary_key_bytes)) = state.msg_db.get(idx_key.as_bytes()) {
            if let Ok(primary_key) = std::str::from_utf8(&primary_key_bytes) {
                // Load existing stored message to preserve id and timestamp
                if let Ok(Some(existing_bytes)) = state.msg_db.get(primary_key.as_bytes()) {
                    if let Ok(mut stored) = serde_json::from_slice::<StoredMessage>(&existing_bytes) {
                        stored.payload = req.0.clone();
                        stored.reply_to = req.0.reply_to.clone();
                        stored.reply_to_preview = req.0.reply_to_preview.clone();
                        let updated = serde_json::to_vec(&stored)
                            .map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::INTERNAL_SERVER_ERROR))?;
                        state.msg_db.insert(primary_key.as_bytes(), updated)
                            .map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::INTERNAL_SERVER_ERROR))?;
                    }
                }
            }
        }

        let event = RealtimeEvent::EditMessage {
            payload: req.0.clone(),
            timestamp,
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

        // Look up and remove via secondary index
        let idx_key = format!("msg_idx:{}", mid.0);
        if let Ok(Some(primary_key_bytes)) = state.msg_db.get(idx_key.as_bytes()) {
            if let Ok(primary_key) = std::str::from_utf8(&primary_key_bytes) {
                state.msg_db.remove(primary_key.as_bytes())
                    .map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::INTERNAL_SERVER_ERROR))?;
            }
        }
        state.msg_db.remove(idx_key.as_bytes())
            .map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::INTERNAL_SERVER_ERROR))?;

        let event = RealtimeEvent::DeleteMessage {
            message_id: mid.0.clone(),
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
    ) -> Result<Json<Vec<String>>> {
        let token = auth_header.0.ok_or(poem::Error::from_string("Missing Auth Token", poem::http::StatusCode::FORBIDDEN))?;
        let sender_id = decode_user_id_from_token(&token)
            .map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::FORBIDDEN))?;

        // First pass: collect all original messages from Sled
        let mut orig_messages: Vec<StoredMessage> = Vec::new();
        let mut unique_sender_ids: std::collections::HashSet<String> = std::collections::HashSet::new();
        for orig_id in &req.0.message_ids {
            let idx_key = format!("msg_idx:{}", orig_id);
            if let Some(primary_key_bytes) = state.msg_db.get(idx_key.as_bytes())
                .map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::INTERNAL_SERVER_ERROR))?
            {
                if let Ok(primary_key) = std::str::from_utf8(&primary_key_bytes) {
                    if let Some(msg_bytes) = state.msg_db.get(primary_key.as_bytes())
                        .map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::INTERNAL_SERVER_ERROR))?
                    {
                        if let Ok(m) = serde_json::from_slice::<StoredMessage>(&msg_bytes) {
                            unique_sender_ids.insert(m.payload.sender_id.clone());
                            orig_messages.push(m);
                        }
                    }
                }
            }
        }

        // Batch fetch sender names in a single query
        let unique_ids_vec: Vec<String> = unique_sender_ids.into_iter().collect();
        let sender_names = fetch_user_names(&state.sql_pool, &unique_ids_vec)
            .await
            .map_err(InternalServerError)?;

        let mut new_ids: Vec<String> = Vec::new();
        for orig_stored in orig_messages {
            let orig_sender_name = sender_names.get(&orig_stored.payload.sender_id)
                .cloned()
                .unwrap_or_else(|| orig_stored.payload.sender_id.clone());

            let forward_info = ForwardInfo {
                original_message_id: orig_stored.id.clone(),
                original_sender_id: orig_stored.payload.sender_id.clone(),
                original_sender_name: orig_sender_name,
                original_timestamp: orig_stored.timestamp,
            };

            let msg_id = Uuid::new_v4().to_string();
            let timestamp = chrono::Utc::now().timestamp();

            let mut payload = orig_stored.payload.clone();
            payload.sender_id = sender_id.clone();
            payload.forward_info = Some(forward_info);

            let event;
            match req.0.target_type.as_str() {
                "user" => {
                    payload.group_id = None;
                    payload.recipient_id = Some(req.0.target_id.clone());

                    let mut pair = vec![sender_id.clone(), req.0.target_id.clone()];
                    pair.sort();
                    let dm_key = format!("dm:{}:{}:ts:{:020}:{}", pair[0], pair[1], timestamp, msg_id);
                    let stored = StoredMessage { id: msg_id.clone(), timestamp, payload: payload.clone(), reply_to: None, reply_to_preview: None };
                    let value = serde_json::to_vec(&stored).map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::INTERNAL_SERVER_ERROR))?;
                    state.msg_db.insert(dm_key.as_bytes(), value).map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::INTERNAL_SERVER_ERROR))?;
                    let new_idx_key = format!("msg_idx:{}", msg_id);
                    state.msg_db.insert(new_idx_key.as_bytes(), dm_key.as_bytes()).map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::INTERNAL_SERVER_ERROR))?;
                    event = RealtimeEvent::DmMessage { payload, timestamp };
                }
                _ => {
                    // "channel" or "group"
                    payload.group_id = Some(req.0.target_id.clone());
                    payload.recipient_id = None;

                    let key = format!("group:{}:ts:{:020}:{}", req.0.target_id, timestamp, msg_id);
                    let stored = StoredMessage { id: msg_id.clone(), timestamp, payload: payload.clone(), reply_to: None, reply_to_preview: None };
                    let value = serde_json::to_vec(&stored).map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::INTERNAL_SERVER_ERROR))?;
                    state.msg_db.insert(key.as_bytes(), value).map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::INTERNAL_SERVER_ERROR))?;
                    let new_idx_key = format!("msg_idx:{}", msg_id);
                    state.msg_db.insert(new_idx_key.as_bytes(), key.as_bytes()).map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::INTERNAL_SERVER_ERROR))?;
                    event = RealtimeEvent::NewMessage { payload, timestamp };
                }
            }
            let _ = state.sender.send(event);
            new_ids.push(msg_id);
        }

        Ok(Json(new_ids))
    }

    /// 合并转发（多条消息合并为一条）
    #[oai(path = "/messages/forward_combined", method = "post")]
    async fn forward_combined(
        &self,
        state: Data<&AppState>,
        req: Json<ForwardCombinedRequest>,
        #[oai(name = "Authorization")] auth_header: Header<Option<String>>,
    ) -> Result<Json<String>> {
        let token = auth_header.0.ok_or(poem::Error::from_string("Missing Auth Token", poem::http::StatusCode::FORBIDDEN))?;
        let sender_id = decode_user_id_from_token(&token)
            .map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::FORBIDDEN))?;

        // First pass: collect all original messages and unique sender IDs
        let mut orig_messages: Vec<StoredMessage> = Vec::new();
        let mut unique_sender_ids: std::collections::HashSet<String> = std::collections::HashSet::new();
        for orig_id in &req.0.message_ids {
            let idx_key = format!("msg_idx:{}", orig_id);
            if let Some(primary_key_bytes) = state.msg_db.get(idx_key.as_bytes())
                .map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::INTERNAL_SERVER_ERROR))?
            {
                if let Ok(primary_key) = std::str::from_utf8(&primary_key_bytes) {
                    if let Some(msg_bytes) = state.msg_db.get(primary_key.as_bytes())
                        .map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::INTERNAL_SERVER_ERROR))?
                    {
                        if let Ok(m) = serde_json::from_slice::<StoredMessage>(&msg_bytes) {
                            unique_sender_ids.insert(m.payload.sender_id.clone());
                            orig_messages.push(m);
                        }
                    }
                }
            }
        }

        // Batch fetch sender names in a single query
        let unique_ids_vec: Vec<String> = unique_sender_ids.into_iter().collect();
        let sender_names = fetch_user_names(&state.sql_pool, &unique_ids_vec)
            .await
            .map_err(InternalServerError)?;

        // Build combined payload
        let mut combined_parts: Vec<serde_json::Value> = Vec::new();
        let mut first_forward_info: Option<ForwardInfo> = None;

        for orig_stored in &orig_messages {
            let orig_sender_name = sender_names.get(&orig_stored.payload.sender_id)
                .cloned()
                .unwrap_or_else(|| orig_stored.payload.sender_id.clone());

            if first_forward_info.is_none() {
                first_forward_info = Some(ForwardInfo {
                    original_message_id: orig_stored.id.clone(),
                    original_sender_id: orig_stored.payload.sender_id.clone(),
                    original_sender_name: orig_sender_name.clone(),
                    original_timestamp: orig_stored.timestamp,
                });
            }

            combined_parts.push(serde_json::json!({
                "id": orig_stored.id,
                "sender_id": orig_stored.payload.sender_id,
                "sender_name": orig_sender_name,
                "timestamp": orig_stored.timestamp,
                "encrypted_blob": orig_stored.payload.encrypted_blob,
                "nonce": orig_stored.payload.nonce,
            }));
        }

        let combined_blob = serde_json::to_string(&combined_parts)
            .map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::INTERNAL_SERVER_ERROR))?;

        let msg_id = Uuid::new_v4().to_string();
        let timestamp = chrono::Utc::now().timestamp();

        let payload = MessagePayload {
            encrypted_blob: combined_blob,
            nonce: "combined_forward".to_string(),
            sender_id: sender_id.clone(),
            group_id: if req.0.target_type != "user" { Some(req.0.target_id.clone()) } else { None },
            recipient_id: if req.0.target_type == "user" { Some(req.0.target_id.clone()) } else { None },
            recipient_keys: std::collections::HashMap::new(),
            reply_to: None,
            reply_to_preview: None,
            mentions: Vec::new(),
            content_type: Some("text".to_string()),
            forward_info: first_forward_info,
        };

        let event;
        match req.0.target_type.as_str() {
            "user" => {
                let mut pair = vec![sender_id.clone(), req.0.target_id.clone()];
                pair.sort();
                let dm_key = format!("dm:{}:{}:ts:{:020}:{}", pair[0], pair[1], timestamp, msg_id);
                let stored = StoredMessage { id: msg_id.clone(), timestamp, payload: payload.clone(), reply_to: None, reply_to_preview: None };
                let value = serde_json::to_vec(&stored).map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::INTERNAL_SERVER_ERROR))?;
                state.msg_db.insert(dm_key.as_bytes(), value).map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::INTERNAL_SERVER_ERROR))?;
                let new_idx_key = format!("msg_idx:{}", msg_id);
                state.msg_db.insert(new_idx_key.as_bytes(), dm_key.as_bytes()).map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::INTERNAL_SERVER_ERROR))?;
                event = RealtimeEvent::DmMessage { payload, timestamp };
            }
            _ => {
                let key = format!("group:{}:ts:{:020}:{}", req.0.target_id, timestamp, msg_id);
                let stored = StoredMessage { id: msg_id.clone(), timestamp, payload: payload.clone(), reply_to: None, reply_to_preview: None };
                let value = serde_json::to_vec(&stored).map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::INTERNAL_SERVER_ERROR))?;
                state.msg_db.insert(key.as_bytes(), value).map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::INTERNAL_SERVER_ERROR))?;
                let new_idx_key = format!("msg_idx:{}", msg_id);
                state.msg_db.insert(new_idx_key.as_bytes(), key.as_bytes()).map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::INTERNAL_SERVER_ERROR))?;
                event = RealtimeEvent::NewMessage { payload, timestamp };
            }
        }
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

    /// 发送正在输入指示（Typing indicator）
    #[oai(path = "/messages/typing", method = "post")]
    async fn send_typing(
        &self,
        state: Data<&AppState>,
        req: Json<TypingRequest>,
        #[oai(name = "Authorization")] auth_header: Header<Option<String>>,
    ) -> Result<Json<String>> {
        let token = auth_header.0.ok_or(poem::Error::from_string("Missing Auth Token", poem::http::StatusCode::FORBIDDEN))?;
        let user_id = decode_user_id_from_token(&token)
            .map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::FORBIDDEN))?;

        let event = RealtimeEvent::Typing {
            user_id,
            channel_id: req.0.channel_id.clone(),
            recipient_id: req.0.recipient_id.clone(),
            is_typing: req.0.is_typing,
            timestamp: chrono::Utc::now().timestamp(),
        };
        let _ = state.sender.send(event);
        Ok(Json("ok".to_string()))
    }

    /// 获取消息上下文（用于回复引用，通过消息 ID 查找）
    #[oai(path = "/messages/context/:message_id", method = "get")]
    async fn get_message_context(
        &self,
        state: Data<&AppState>,
        message_id: Path<String>,
        #[oai(name = "Authorization")] auth_header: Header<Option<String>>,
    ) -> Result<Json<StoredMessage>> {
        let _token = auth_header.0.ok_or(poem::Error::from_string("Missing Auth Token", poem::http::StatusCode::FORBIDDEN))?;

        let idx_key = format!("msg_idx:{}", message_id.0);
        let value = state.msg_db
            .get(&idx_key)
            .map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::INTERNAL_SERVER_ERROR))?
            .ok_or_else(|| poem::Error::from_string("Message not found", poem::http::StatusCode::NOT_FOUND))?;

        let msg: StoredMessage = serde_json::from_slice(&value)
            .map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::INTERNAL_SERVER_ERROR))?;

        Ok(Json(msg))
    }
}

#[derive(Debug, Object, Deserialize)]
pub struct TypingRequest {
    pub channel_id: Option<String>,
    pub recipient_id: Option<String>,
    pub is_typing: bool,
}

/// Fetch user display names for a list of user IDs in a single batch query.
///
/// Returns a `HashMap` of `user_id -> display_name`. Any user ID not found in the database
/// will simply be absent from the map; callers should fall back to the user ID itself.
async fn fetch_user_names(pool: &sqlx::SqlitePool, user_ids: &[String]) -> Result<HashMap<String, String>, sqlx::Error> {
    if user_ids.is_empty() {
        return Ok(HashMap::new());
    }
    let mut qb: sqlx::QueryBuilder<sqlx::Sqlite> = sqlx::QueryBuilder::new(
        "SELECT id, name FROM users WHERE id IN ("
    );
    let mut separated = qb.separated(", ");
    for uid in user_ids {
        separated.push_bind(uid);
    }
    qb.push(")");
    let rows = qb.build().fetch_all(pool).await?;
    let mut map = HashMap::new();
    for row in rows {
        let id: String = row.get("id");
        let name: String = row.get("name");
        map.insert(id, name);
    }
    Ok(map)
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
            Err(_) => Event::message("{\"event_type\": \"error\", \"message\": \"lagged\"}")
        }
    });

    poem::web::sse::SSE::new(stream).keep_alive(std::time::Duration::from_secs(10))
}
