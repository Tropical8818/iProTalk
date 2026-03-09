use poem::{web::Data, Result, error::InternalServerError};
use poem_openapi::{OpenApi, payload::Json, param::{Path, Header}, Object};
use serde::{Deserialize, Serialize};
use crate::{db::AppState, api::utils::decode_user_id_from_token, models::{MessagePayload, RealtimeEvent}, api::audit::log_audit};
use sqlx::Row;
use uuid::Uuid;

#[derive(Clone, Default)]
pub struct WebhookApi;

#[derive(Debug, Object, Serialize, Deserialize)]
pub struct Webhook {
    pub id: String,
    pub name: String,
    pub channel_id: String,
    pub secret: String,
    pub created_by: String,
    pub created_at: String,
}

#[derive(Debug, Object, Deserialize)]
pub struct CreateWebhookReq {
    pub name: String,
    pub channel_id: String,
}

#[derive(Debug, Object, Deserialize)]
pub struct WebhookMessageReq {
    pub content: String,
    pub username: Option<String>,
}

#[OpenApi]
impl WebhookApi {
    /// 创建webhook
    #[oai(path = "/webhooks", method = "post")]
    async fn create_webhook(
        &self,
        state: Data<&AppState>,
        req: Json<CreateWebhookReq>,
        #[oai(name = "Authorization")] auth_header: Header<Option<String>>,
    ) -> Result<Json<Webhook>> {
        let token = auth_header.0.ok_or(poem::Error::from_string("Missing Auth Token", poem::http::StatusCode::FORBIDDEN))?;
        let user_id = decode_user_id_from_token(&token)
            .map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::FORBIDDEN))?;

        let id = Uuid::new_v4().to_string();
        let secret = Uuid::new_v4().to_string().replace("-", "");

        sqlx::query("INSERT INTO webhooks (id, name, channel_id, secret, created_by) VALUES (?, ?, ?, ?, ?)")
            .bind(&id)
            .bind(&req.0.name)
            .bind(&req.0.channel_id)
            .bind(&secret)
            .bind(&user_id)
            .execute(&state.sql_pool)
            .await
            .map_err(InternalServerError)?;

        Ok(Json(Webhook {
            id,
            name: req.0.name,
            channel_id: req.0.channel_id,
            secret,
            created_by: user_id,
            created_at: chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        }))
    }

    /// 获取所有webhook
    #[oai(path = "/webhooks", method = "get")]
    async fn list_webhooks(
        &self,
        state: Data<&AppState>,
        #[oai(name = "Authorization")] auth_header: Header<Option<String>>,
    ) -> Result<Json<Vec<Webhook>>> {
        let _token = auth_header.0.ok_or(poem::Error::from_string("Missing Auth Token", poem::http::StatusCode::FORBIDDEN))?;

        let rows = sqlx::query("SELECT id, name, channel_id, secret, created_by, created_at FROM webhooks ORDER BY created_at DESC")
            .fetch_all(&state.sql_pool)
            .await
            .map_err(InternalServerError)?;

        let hooks: Vec<Webhook> = rows.iter().map(|r| Webhook {
            id: r.get("id"),
            name: r.get("name"),
            channel_id: r.get("channel_id"),
            secret: r.get("secret"),
            created_by: r.get("created_by"),
            created_at: r.get("created_at"),
        }).collect();

        Ok(Json(hooks))
    }

    /// 删除webhook
    #[oai(path = "/webhooks/:id", method = "delete")]
    async fn delete_webhook(
        &self,
        state: Data<&AppState>,
        id: Path<String>,
        #[oai(name = "Authorization")] auth_header: Header<Option<String>>,
    ) -> Result<Json<String>> {
        let _token = auth_header.0.ok_or(poem::Error::from_string("Missing Auth Token", poem::http::StatusCode::FORBIDDEN))?;

        sqlx::query("DELETE FROM webhooks WHERE id = ?")
            .bind(&id.0)
            .execute(&state.sql_pool)
            .await
            .map_err(InternalServerError)?;

        Ok(Json("Webhook deleted".to_string()))
    }

    /// 通过webhook发送消息（外部调用，无需认证，通过secret验证）
    #[oai(path = "/webhooks/:id/send", method = "post")]
    async fn send_via_webhook(
        &self,
        state: Data<&AppState>,
        id: Path<String>,
        req: Json<WebhookMessageReq>,
        #[oai(name = "X-Webhook-Secret")] secret_header: Header<Option<String>>,
    ) -> Result<Json<String>> {
        let provided_secret = secret_header.0.ok_or(
            poem::Error::from_string("Missing X-Webhook-Secret header", poem::http::StatusCode::UNAUTHORIZED)
        )?;

        let row = sqlx::query("SELECT channel_id, secret, name FROM webhooks WHERE id = ?")
            .bind(&id.0)
            .fetch_optional(&state.sql_pool)
            .await
            .map_err(InternalServerError)?;

        let row = row.ok_or(poem::Error::from_string("Webhook not found", poem::http::StatusCode::NOT_FOUND))?;
        let stored_secret: String = row.get("secret");
        let channel_id: String = row.get("channel_id");
        let webhook_name: String = row.get("name");

        if provided_secret != stored_secret {
            return Err(poem::Error::from_string("Invalid secret", poem::http::StatusCode::UNAUTHORIZED));
        }

        let sender_name = req.0.username.unwrap_or(webhook_name);
        let msg_id = format!("wh-{}-{}", id.0, chrono::Utc::now().timestamp_millis());

        let payload = MessagePayload {
            encrypted_blob: req.0.content,
            nonce: String::new(),
            sender_id: format!("webhook:{}", sender_name),
            group_id: Some(channel_id.clone()),
            recipient_id: None,
            recipient_keys: std::collections::HashMap::new(),
            reply_to: None,
            reply_to_preview: None,
            mentions: Vec::new(),
            content_type: Some("text".to_string()),
            forward_info: None,
        };

        let timestamp = chrono::Utc::now().timestamp();
        let event = RealtimeEvent::NewMessage {
            payload: payload.clone(),
            timestamp,
        };

        // Store in Sled
        let stored = serde_json::to_vec(&serde_json::json!({
            "id": msg_id,
            "timestamp": timestamp,
            "payload": payload,
        }))
        .map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::INTERNAL_SERVER_ERROR))?;
        state.msg_db
            .insert(msg_id.as_bytes(), stored)
            .map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::INTERNAL_SERVER_ERROR))?;

        // Broadcast via SSE
        let _ = state.sender.send(event);

        log_audit(
            &state.sql_pool,
            None,
            "webhook",
            "webhook.trigger",
            Some("webhook"),
            Some(&id.0),
            Some(serde_json::json!({ "channel_id": channel_id })),
            None,
        )
        .await;

        Ok(Json("Message sent via webhook".to_string()))
    }
}
