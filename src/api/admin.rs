use poem::{web::Data, Result, error::InternalServerError};
use poem_openapi::{OpenApi, payload::Json, param::{Path, Query, Header}, Object};
use serde::{Deserialize, Serialize};
use crate::{db::AppState, api::utils::decode_user_id_from_token};
use sqlx::Row;
use bcrypt::{hash, DEFAULT_COST};

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
}
