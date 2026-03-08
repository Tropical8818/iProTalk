use poem::{web::Data, Result, error::InternalServerError};
use poem_openapi::{OpenApi, payload::Json, param::{Path, Header}, Object};
use serde::{Deserialize, Serialize};
use crate::{db::AppState, api::utils::decode_user_id_from_token};
use sqlx::Row;
use bcrypt::{hash, DEFAULT_COST};
use uuid::Uuid;

#[derive(Clone, Default)]
pub struct AdminApi;

#[derive(Debug, Object, Serialize, Deserialize)]
pub struct AdminUserResponse {
    pub id: String,
    pub email: String,
    pub name: String,
    pub is_admin: bool,
    pub is_banned: bool,
    pub created_at: i64,
}

#[derive(Debug, Object, Serialize, Deserialize)]
pub struct AdminPasswordResetReq {
    pub new_password: String,
}

#[derive(Debug, Object, Serialize, Deserialize)]
pub struct RegistrationSettingResponse {
    pub allow_registration: bool,
}

#[derive(Debug, Object, Serialize, Deserialize)]
pub struct ServerStatsResponse {
    pub total_users: i64,
    pub total_channels: i64,
    pub total_messages: i64,
}

#[derive(Debug, Object, Serialize, Deserialize)]
pub struct InviteLink {
    pub code: String,
    pub created_by: String,
    pub max_uses: i64,
    pub used_count: i64,
    pub expires_at: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Object, Deserialize)]
pub struct CreateInviteReq {
    pub max_uses: Option<i64>,
    pub expires_hours: Option<i64>,
}

#[OpenApi]
impl AdminApi {
    async fn check_admin(&self, state: &Data<&AppState>, token: &str) -> Result<()> {
        let user_id = decode_user_id_from_token(token)
            .map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::FORBIDDEN))?;

        let row = sqlx::query("SELECT is_admin FROM users WHERE id = ?")
            .bind(&user_id)
            .fetch_optional(&state.sql_pool)
            .await
            .map_err(InternalServerError)?;

        if let Some(row) = row {
            let is_admin: bool = row.get("is_admin");
            if is_admin {
                return Ok(());
            }
        }
        
        Err(poem::Error::from_string("Admin restricted", poem::http::StatusCode::FORBIDDEN))
    }

    #[oai(path = "/admin/users", method = "get")]
    async fn get_users(
        &self,
        state: Data<&AppState>,
        #[oai(name = "Authorization")] auth_header: Header<Option<String>>,
    ) -> Result<Json<Vec<AdminUserResponse>>> {
        let token = auth_header.0.ok_or(poem::Error::from_string("Missing Auth Token", poem::http::StatusCode::FORBIDDEN))?;
        self.check_admin(&state, &token).await?;

        let rows = sqlx::query(
            "SELECT id, email, name, is_admin, is_banned, strftime('%s', created_at) as created_at FROM users"
        )
        .fetch_all(&state.sql_pool)
        .await
        .map_err(InternalServerError)?;

        let mut users = Vec::new();
        for row in rows {
            let created_at: String = row.get("created_at");
            users.push(AdminUserResponse {
                id: row.get("id"),
                email: row.get("email"),
                name: row.get("name"),
                is_admin: row.get("is_admin"),
                is_banned: row.get("is_banned"),
                created_at: created_at.parse().unwrap_or(0),
            });
        }

        Ok(Json(users))
    }

    #[oai(path = "/admin/users/:uid/ban", method = "put")]
    async fn ban_user(
        &self,
        state: Data<&AppState>,
        uid: Path<String>,
        #[oai(name = "Authorization")] auth_header: Header<Option<String>>,
    ) -> Result<Json<String>> {
        let token = auth_header.0.ok_or(poem::Error::from_string("Missing Auth Token", poem::http::StatusCode::FORBIDDEN))?;
        self.check_admin(&state, &token).await?;

        sqlx::query("UPDATE users SET is_banned = CASE WHEN is_banned = 1 THEN 0 ELSE 1 END WHERE id = ?")
            .bind(&uid.0)
            .execute(&state.sql_pool)
            .await
            .map_err(InternalServerError)?;

        Ok(Json("Ban toggled".to_string()))
    }

    #[oai(path = "/admin/users/:uid/admin", method = "put")]
    async fn toggle_admin(
        &self,
        state: Data<&AppState>,
        uid: Path<String>,
        #[oai(name = "Authorization")] auth_header: Header<Option<String>>,
    ) -> Result<Json<String>> {
        let token = auth_header.0.ok_or(poem::Error::from_string("Missing Auth Token", poem::http::StatusCode::FORBIDDEN))?;
        self.check_admin(&state, &token).await?;

        sqlx::query("UPDATE users SET is_admin = CASE WHEN is_admin = 1 THEN 0 ELSE 1 END WHERE id = ?")
            .bind(&uid.0)
            .execute(&state.sql_pool)
            .await
            .map_err(InternalServerError)?;

        Ok(Json("Admin status toggled".to_string()))
    }

    #[oai(path = "/admin/users/:uid", method = "delete")]
    async fn delete_user(
        &self,
        state: Data<&AppState>,
        uid: Path<String>,
        #[oai(name = "Authorization")] auth_header: Header<Option<String>>,
    ) -> Result<Json<String>> {
        let token = auth_header.0.ok_or(poem::Error::from_string("Missing Auth Token", poem::http::StatusCode::FORBIDDEN))?;
        self.check_admin(&state, &token).await?;

        sqlx::query("DELETE FROM users WHERE id = ?")
            .bind(&uid.0)
            .execute(&state.sql_pool)
            .await
            .map_err(InternalServerError)?;

        Ok(Json("User deleted".to_string()))
    }

    #[oai(path = "/admin/users/:uid/reset_password", method = "post")]
    async fn reset_password(
        &self,
        state: Data<&AppState>,
        uid: Path<String>,
        req: Json<AdminPasswordResetReq>,
        #[oai(name = "Authorization")] auth_header: Header<Option<String>>,
    ) -> Result<Json<String>> {
        let token = auth_header.0.ok_or(poem::Error::from_string("Missing Auth Token", poem::http::StatusCode::FORBIDDEN))?;
        self.check_admin(&state, &token).await?;

        let hashed = hash(&req.0.new_password, DEFAULT_COST).map_err(InternalServerError)?;

        sqlx::query("UPDATE users SET password_hash = ? WHERE id = ?")
            .bind(&hashed)
            .bind(&uid.0)
            .execute(&state.sql_pool)
            .await
            .map_err(InternalServerError)?;

        Ok(Json("Password reset".to_string()))
    }

    #[oai(path = "/admin/config/registration", method = "get")]
    async fn get_registration_setting(
        &self,
        state: Data<&AppState>,
        #[oai(name = "Authorization")] auth_header: Header<Option<String>>,
    ) -> Result<Json<RegistrationSettingResponse>> {
        let token = auth_header.0.ok_or(poem::Error::from_string("Missing Auth Token", poem::http::StatusCode::FORBIDDEN))?;
        self.check_admin(&state, &token).await?;

        let row = sqlx::query("SELECT value FROM settings WHERE key = 'allow_registration'")
            .fetch_optional(&state.sql_pool)
            .await
            .map_err(InternalServerError)?;

        let mut allow_reg = true; // default
        if let Some(row) = row {
            let val: String = row.get("value");
            allow_reg = val == "true";
        }

        Ok(Json(RegistrationSettingResponse {
            allow_registration: allow_reg,
        }))
    }

    #[oai(path = "/admin/config/registration", method = "put")]
    async fn toggle_registration_setting(
        &self,
        state: Data<&AppState>,
        #[oai(name = "Authorization")] auth_header: Header<Option<String>>,
    ) -> Result<Json<String>> {
        let token = auth_header.0.ok_or(poem::Error::from_string("Missing Auth Token", poem::http::StatusCode::FORBIDDEN))?;
        self.check_admin(&state, &token).await?;

        let row = sqlx::query("SELECT value FROM settings WHERE key = 'allow_registration'")
            .fetch_optional(&state.sql_pool)
            .await
            .map_err(InternalServerError)?;

        let mut new_val = "false";
        if let Some(row) = row {
            let val: String = row.get("value");
            if val == "false" {
                new_val = "true";
            }
        } else {
             new_val = "false";
        }

        sqlx::query("INSERT OR REPLACE INTO settings (key, value) VALUES ('allow_registration', ?)")
            .bind(new_val)
            .execute(&state.sql_pool)
            .await
            .map_err(InternalServerError)?;

        Ok(Json(format!("Registration allowed set to {}", new_val)))
    }

    #[oai(path = "/admin/stats", method = "get")]
    async fn get_server_stats(
        &self,
        state: Data<&AppState>,
        #[oai(name = "Authorization")] auth_header: Header<Option<String>>,
    ) -> Result<Json<ServerStatsResponse>> {
        let token = auth_header.0.ok_or(poem::Error::from_string("Missing Auth Token", poem::http::StatusCode::FORBIDDEN))?;
        self.check_admin(&state, &token).await?;

        let user_count_row = sqlx::query("SELECT COUNT(*) as count FROM users")
            .fetch_one(&state.sql_pool).await.map_err(InternalServerError)?;
        let total_users: i64 = user_count_row.get(0);

        let channel_count_row = sqlx::query("SELECT COUNT(*) as count FROM channels")
            .fetch_one(&state.sql_pool).await.map_err(InternalServerError)?;
        let total_channels: i64 = channel_count_row.get(0);

        let total_messages = state.msg_db.scan_prefix("").count() as i64;

        Ok(Json(ServerStatsResponse {
            total_users,
            total_channels,
            total_messages,
        }))
    }

    /// 创建邀请码
    #[oai(path = "/admin/invites", method = "post")]
    async fn create_invite(
        &self,
        state: Data<&AppState>,
        req: Json<CreateInviteReq>,
        #[oai(name = "Authorization")] auth_header: Header<Option<String>>,
    ) -> Result<Json<InviteLink>> {
        let token = auth_header.0.ok_or(poem::Error::from_string("Missing Auth Token", poem::http::StatusCode::FORBIDDEN))?;
        self.check_admin(&state, &token).await?;
        let user_id = decode_user_id_from_token(&token)
            .map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::FORBIDDEN))?;

        let code = Uuid::new_v4().to_string().replace("-", "")[..8].to_string();
        let max_uses = req.0.max_uses.unwrap_or(-1); // -1 = unlimited
        let expires_at: Option<String> = req.0.expires_hours.map(|h| {
            let dt = chrono::Utc::now() + chrono::Duration::hours(h);
            dt.format("%Y-%m-%d %H:%M:%S").to_string()
        });

        sqlx::query("INSERT INTO invite_links (code, created_by, max_uses, expires_at) VALUES (?, ?, ?, ?)")
            .bind(&code)
            .bind(&user_id)
            .bind(max_uses)
            .bind(&expires_at)
            .execute(&state.sql_pool)
            .await
            .map_err(InternalServerError)?;

        Ok(Json(InviteLink {
            code,
            created_by: user_id,
            max_uses,
            used_count: 0,
            expires_at,
            created_at: chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        }))
    }

    /// 获取所有邀请码
    #[oai(path = "/admin/invites", method = "get")]
    async fn list_invites(
        &self,
        state: Data<&AppState>,
        #[oai(name = "Authorization")] auth_header: Header<Option<String>>,
    ) -> Result<Json<Vec<InviteLink>>> {
        let token = auth_header.0.ok_or(poem::Error::from_string("Missing Auth Token", poem::http::StatusCode::FORBIDDEN))?;
        self.check_admin(&state, &token).await?;

        let rows = sqlx::query("SELECT code, created_by, max_uses, used_count, expires_at, created_at FROM invite_links ORDER BY created_at DESC")
            .fetch_all(&state.sql_pool)
            .await
            .map_err(InternalServerError)?;

        let links: Vec<InviteLink> = rows.iter().map(|r| InviteLink {
            code: r.get("code"),
            created_by: r.get("created_by"),
            max_uses: r.get("max_uses"),
            used_count: r.get("used_count"),
            expires_at: r.get("expires_at"),
            created_at: r.get("created_at"),
        }).collect();

        Ok(Json(links))
    }

    /// 删除邀请码
    #[oai(path = "/admin/invites/:code", method = "delete")]
    async fn delete_invite(
        &self,
        state: Data<&AppState>,
        code: Path<String>,
        #[oai(name = "Authorization")] auth_header: Header<Option<String>>,
    ) -> Result<Json<String>> {
        let token = auth_header.0.ok_or(poem::Error::from_string("Missing Auth Token", poem::http::StatusCode::FORBIDDEN))?;
        self.check_admin(&state, &token).await?;

        sqlx::query("DELETE FROM invite_links WHERE code = ?")
            .bind(&code.0)
            .execute(&state.sql_pool)
            .await
            .map_err(InternalServerError)?;

        Ok(Json("Invite deleted".to_string()))
    }

    /// 公开：验证邀请码有效性
    #[oai(path = "/admin/invites/:code/validate", method = "get")]
    async fn validate_invite(
        &self,
        state: Data<&AppState>,
        code: Path<String>,
    ) -> Result<Json<bool>> {
        let row = sqlx::query("SELECT max_uses, used_count, expires_at FROM invite_links WHERE code = ?")
            .bind(&code.0)
            .fetch_optional(&state.sql_pool)
            .await
            .map_err(InternalServerError)?;

        let valid = match row {
            None => false,
            Some(r) => {
                let max_uses: i64 = r.get("max_uses");
                let used_count: i64 = r.get("used_count");
                let expires_at: Option<String> = r.get("expires_at");
                let within_uses = max_uses < 0 || used_count < max_uses;
                let not_expired = expires_at.map(|e| {
                    chrono::NaiveDateTime::parse_from_str(&e, "%Y-%m-%d %H:%M:%S")
                        .map(|dt| dt > chrono::Utc::now().naive_utc())
                        .unwrap_or(false)
                }).unwrap_or(true);
                within_uses && not_expired
            }
        };

        Ok(Json(valid))
    }
}
