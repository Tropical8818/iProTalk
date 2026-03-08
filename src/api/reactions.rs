use poem::{web::Data, Result, error::InternalServerError};
use poem_openapi::{OpenApi, payload::Json, param::{Path, Header}, Object};
use serde::{Deserialize, Serialize};
use crate::{db::AppState, models::RealtimeEvent, api::utils::decode_user_id_from_token};
use uuid::Uuid;
use sqlx::Row;

#[derive(Clone, Default)]
pub struct ReactionsApi;

#[derive(Debug, Object, Serialize, Deserialize)]
pub struct MessageReaction {
    pub id: String,
    pub message_id: String,
    pub user_id: String,
    pub emoji: String,
    pub created_at: String,
}

#[derive(Debug, Object, Serialize, Deserialize)]
pub struct ReactionSummary {
    pub emoji: String,
    pub count: i64,
    /// Whether the requesting user has reacted with this emoji
    pub reacted_by_me: bool,
    pub user_ids: Vec<String>,
}

#[derive(Debug, Object, Deserialize)]
pub struct AddReactionReq {
    pub emoji: String,
}

#[OpenApi]
impl ReactionsApi {
    /// 为消息添加表情回应
    #[oai(path = "/messages/:mid/reactions", method = "post")]
    async fn add_reaction(
        &self,
        state: Data<&AppState>,
        mid: Path<String>,
        req: Json<AddReactionReq>,
        #[oai(name = "Authorization")] auth_header: Header<Option<String>>,
    ) -> Result<Json<String>> {
        let token = auth_header.0.ok_or(poem::Error::from_string(
            "Missing Auth Token",
            poem::http::StatusCode::FORBIDDEN,
        ))?;
        let user_id = decode_user_id_from_token(&token)
            .map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::FORBIDDEN))?;

        let reaction_id = Uuid::new_v4().to_string();

        sqlx::query(
            "INSERT OR IGNORE INTO message_reactions (id, message_id, user_id, emoji) VALUES (?, ?, ?, ?)"
        )
        .bind(&reaction_id)
        .bind(&mid.0)
        .bind(&user_id)
        .bind(&req.0.emoji)
        .execute(&state.sql_pool)
        .await
        .map_err(InternalServerError)?;

        let event = RealtimeEvent::Reaction {
            message_id: mid.0.clone(),
            user_id,
            emoji: req.0.emoji.clone(),
            action: "add".to_string(),
            timestamp: chrono::Utc::now().timestamp(),
        };
        let _ = state.sender.send(event);

        Ok(Json(reaction_id))
    }

    /// 取消表情回应
    #[oai(path = "/messages/:mid/reactions/:emoji", method = "delete")]
    async fn remove_reaction(
        &self,
        state: Data<&AppState>,
        mid: Path<String>,
        emoji: Path<String>,
        #[oai(name = "Authorization")] auth_header: Header<Option<String>>,
    ) -> Result<Json<String>> {
        let token = auth_header.0.ok_or(poem::Error::from_string(
            "Missing Auth Token",
            poem::http::StatusCode::FORBIDDEN,
        ))?;
        let user_id = decode_user_id_from_token(&token)
            .map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::FORBIDDEN))?;

        sqlx::query(
            "DELETE FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?"
        )
        .bind(&mid.0)
        .bind(&user_id)
        .bind(&emoji.0)
        .execute(&state.sql_pool)
        .await
        .map_err(InternalServerError)?;

        let event = RealtimeEvent::Reaction {
            message_id: mid.0.clone(),
            user_id,
            emoji: emoji.0.clone(),
            action: "remove".to_string(),
            timestamp: chrono::Utc::now().timestamp(),
        };
        let _ = state.sender.send(event);

        Ok(Json("Removed".to_string()))
    }

    /// 获取消息的表情回应汇总
    #[oai(path = "/messages/:mid/reactions", method = "get")]
    async fn get_reactions(
        &self,
        state: Data<&AppState>,
        mid: Path<String>,
        #[oai(name = "Authorization")] auth_header: Header<Option<String>>,
    ) -> Result<Json<Vec<ReactionSummary>>> {
        let token = auth_header.0.ok_or(poem::Error::from_string(
            "Missing Auth Token",
            poem::http::StatusCode::FORBIDDEN,
        ))?;
        let me = decode_user_id_from_token(&token)
            .map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::FORBIDDEN))?;

        // Get all reactions for this message
        let rows = sqlx::query(
            "SELECT emoji, user_id FROM message_reactions WHERE message_id = ? ORDER BY emoji, created_at"
        )
        .bind(&mid.0)
        .fetch_all(&state.sql_pool)
        .await
        .map_err(InternalServerError)?;

        // Group by emoji
        let mut map: std::collections::HashMap<String, Vec<String>> = std::collections::HashMap::new();
        for row in &rows {
            let emoji: String = row.get("emoji");
            let uid: String = row.get("user_id");
            map.entry(emoji).or_default().push(uid);
        }

        let summaries: Vec<ReactionSummary> = map
            .into_iter()
            .map(|(emoji, user_ids)| {
                let count = user_ids.len() as i64;
                let reacted_by_me = user_ids.contains(&me);
                ReactionSummary { emoji, count, reacted_by_me, user_ids }
            })
            .collect();

        Ok(Json(summaries))
    }
}
