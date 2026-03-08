use poem::{web::Data, Result, error::InternalServerError};
use poem_openapi::{OpenApi, payload::Json, param::{Header, Query}, Object};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use uuid::Uuid;

use crate::{db::AppState, api::utils::decode_user_id_from_token};

#[derive(Clone, Default)]
pub struct AuditApi;

#[derive(Debug, Object, Serialize, Deserialize)]
pub struct AuditLogEntry {
    pub id: String,
    pub actor_id: Option<String>,
    pub actor_type: String,
    pub action: String,
    pub target_type: Option<String>,
    pub target_id: Option<String>,
    pub metadata: Option<String>,
    pub ip_address: Option<String>,
    pub created_at: String,
}

/// Write an audit log entry. Failures are silently swallowed so they never
/// block the main business logic.
pub async fn log_audit(
    pool: &sqlx::SqlitePool,
    actor_id: Option<&str>,
    actor_type: &str,
    action: &str,
    target_type: Option<&str>,
    target_id: Option<&str>,
    metadata: Option<serde_json::Value>,
    ip: Option<&str>,
) {
    let id = Uuid::new_v4().to_string();
    let meta_str = metadata.map(|v| v.to_string());

    let result = sqlx::query(
        "INSERT INTO audit_logs (id, actor_id, actor_type, action, target_type, target_id, metadata, ip_address) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(actor_id)
    .bind(actor_type)
    .bind(action)
    .bind(target_type)
    .bind(target_id)
    .bind(meta_str.as_deref())
    .bind(ip)
    .execute(pool)
    .await;

    if let Err(e) = result {
        tracing::error!("Failed to write audit log ({}): {}", action, e);
    }
}

#[OpenApi]
impl AuditApi {
    /// List audit log entries (admin only)
    #[oai(path = "/admin/audit-logs", method = "get")]
    async fn list_audit_logs(
        &self,
        state: Data<&AppState>,
        #[oai(name = "Authorization")] auth_header: Header<Option<String>>,
        limit: Query<Option<i64>>,
        offset: Query<Option<i64>>,
        action: Query<Option<String>>,
    ) -> Result<Json<Vec<AuditLogEntry>>> {
        let token = auth_header
            .0
            .ok_or_else(|| poem::Error::from_string("Missing Auth Token", poem::http::StatusCode::FORBIDDEN))?;
        let user_id = decode_user_id_from_token(&token)
            .map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::FORBIDDEN))?;

        // Verify admin
        let row = sqlx::query("SELECT is_admin FROM users WHERE id = ?")
            .bind(&user_id)
            .fetch_optional(&state.sql_pool)
            .await
            .map_err(InternalServerError)?;

        let is_admin = row
            .map(|r| r.get::<bool, _>("is_admin"))
            .unwrap_or(false);
        if !is_admin {
            return Err(poem::Error::from_string(
                "Admin restricted",
                poem::http::StatusCode::FORBIDDEN,
            ));
        }

        let limit_val = limit.0.unwrap_or(50).min(200);
        let offset_val = offset.0.unwrap_or(0);

        let rows = if let Some(ref act) = action.0 {
            sqlx::query(
                "SELECT id, actor_id, actor_type, action, target_type, target_id, metadata, ip_address, created_at \
                 FROM audit_logs WHERE action = ? ORDER BY created_at DESC LIMIT ? OFFSET ?",
            )
            .bind(act)
            .bind(limit_val)
            .bind(offset_val)
            .fetch_all(&state.sql_pool)
            .await
            .map_err(InternalServerError)?
        } else {
            sqlx::query(
                "SELECT id, actor_id, actor_type, action, target_type, target_id, metadata, ip_address, created_at \
                 FROM audit_logs ORDER BY created_at DESC LIMIT ? OFFSET ?",
            )
            .bind(limit_val)
            .bind(offset_val)
            .fetch_all(&state.sql_pool)
            .await
            .map_err(InternalServerError)?
        };

        let entries: Vec<AuditLogEntry> = rows
            .iter()
            .map(|r| AuditLogEntry {
                id: r.get("id"),
                actor_id: r.get("actor_id"),
                actor_type: r.get("actor_type"),
                action: r.get("action"),
                target_type: r.get("target_type"),
                target_id: r.get("target_id"),
                metadata: r.get("metadata"),
                ip_address: r.get("ip_address"),
                created_at: r.get("created_at"),
            })
            .collect();

        Ok(Json(entries))
    }
}
