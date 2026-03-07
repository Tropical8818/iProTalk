use poem::{web::{Data, Query}, Result, error::InternalServerError, Body, Response};
use poem_openapi::{OpenApi, payload::{Json, Binary}, param::{Header, Path}};
use crate::{db::AppState, api::utils::decode_user_id_from_token};
use sqlx::Row;
use serde::{Deserialize, Serialize};
use poem_openapi::Object;
use tokio::fs::{File, OpenOptions};
use tokio::io::AsyncWriteExt;
use std::path::Path as FilePath;

#[derive(Clone, Default)]
pub struct UsersApi;

#[derive(Debug, Object, Serialize, Deserialize)]
pub struct UserPublicKeyInfo {
    pub user_id: String,
    pub name: String,
    pub email: Option<String>,
    pub public_key: Option<String>,
    pub is_admin: Option<bool>,
}

#[derive(Deserialize)]
pub struct SearchQuery {
    pub q: Option<String>,
}

#[OpenApi]
impl UsersApi {
    /// 获取所有用户（含公钥）
    #[oai(path = "/users", method = "get")]
    async fn get_all_users(
        &self,
        state: Data<&AppState>,
    ) -> Result<Json<Vec<UserPublicKeyInfo>>> {
        let rows = sqlx::query(
            "SELECT u.id, u.name, u.email, u.is_admin, k.public_key
             FROM users u
             LEFT JOIN user_keys k ON u.id = k.user_id
             WHERE u.is_banned = 0"
        )
        .fetch_all(&state.sql_pool)
        .await
        .map_err(InternalServerError)?;

        let mut users = Vec::new();
        for row in rows {
            users.push(UserPublicKeyInfo {
                user_id: row.get("id"),
                name: row.get("name"),
                email: row.try_get("email").ok(),
                public_key: row.try_get("public_key").ok().flatten(),
                is_admin: row.try_get("is_admin").ok(),
            });
        }

        Ok(Json(users))
    }

    /// 搜索用户（按名字或邮箱模糊匹配）
    #[oai(path = "/users/search", method = "get")]
    async fn search_users(
        &self,
        state: Data<&AppState>,
        Query(params): Query<SearchQuery>,
        #[oai(name = "Authorization")] auth_header: Header<Option<String>>,
    ) -> Result<Json<Vec<UserPublicKeyInfo>>> {
        let _token = auth_header.0.ok_or(poem::Error::from_string("Missing Auth Token", poem::http::StatusCode::FORBIDDEN))?;
        let q = params.q.unwrap_or_default();
        let pattern = format!("%{}%", q);

        let rows = sqlx::query(
            "SELECT u.id, u.name, u.email, u.is_admin, k.public_key
             FROM users u
             LEFT JOIN user_keys k ON u.id = k.user_id
             WHERE u.is_banned = 0 AND (u.name LIKE ? OR u.email LIKE ?)
             LIMIT 20"
        )
        .bind(&pattern)
        .bind(&pattern)
        .fetch_all(&state.sql_pool)
        .await
        .map_err(InternalServerError)?;

        let mut users = Vec::new();
        for row in rows {
            users.push(UserPublicKeyInfo {
                user_id: row.get("id"),
                name: row.get("name"),
                email: row.try_get("email").ok(),
                public_key: row.try_get("public_key").ok().flatten(),
                is_admin: row.try_get("is_admin").ok(),
            });
        }

        Ok(Json(users))
    }

    /// 上传头像（二进制图片数据）
    #[oai(path = "/users/avatar", method = "post")]
    async fn upload_avatar(
        &self,
        state: Data<&AppState>,
        req: Binary<Vec<u8>>,
        #[oai(name = "Authorization")] auth_header: Header<Option<String>>,
    ) -> Result<Json<String>> {
        let token = auth_header.0.ok_or(poem::Error::from_string("Missing Auth Token", poem::http::StatusCode::FORBIDDEN))?;
        let user_id = decode_user_id_from_token(&token)
            .map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::FORBIDDEN))?;

        let dir = FilePath::new("data/avatars");
        tokio::fs::create_dir_all(dir).await.map_err(InternalServerError)?;

        let file_path = dir.join(format!("{}.png", user_id));
        let mut file = OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(true)
            .open(&file_path)
            .await
            .map_err(InternalServerError)?;

        file.write_all(&req.0).await.map_err(InternalServerError)?;

        sqlx::query("UPDATE users SET avatar = ? WHERE id = ?")
            .bind(file_path.to_string_lossy().to_string())
            .bind(&user_id)
            .execute(&state.sql_pool)
            .await
            .map_err(InternalServerError)?;

        Ok(Json("Avatar updated".to_string()))
    }
}

#[poem::handler]
pub async fn get_avatar(
    state: Data<&AppState>,
    uid: poem::web::Path<String>,
) -> Result<Response> {
    let row = sqlx::query("SELECT avatar FROM users WHERE id = ?")
        .bind(&uid.0)
        .fetch_optional(&state.sql_pool)
        .await
        .map_err(InternalServerError)?;

    if let Some(row) = row {
        let path_opt: Option<String> = row.try_get("avatar").ok();
        if let Some(path) = path_opt {
            if let Ok(file) = File::open(path).await {
                let res = Response::builder()
                    .header(poem::http::header::CONTENT_TYPE, "image/png")
                    .body(Body::from_async_read(file));
                return Ok(res);
            }
        }
    }

    Err(poem::Error::from_string("Avatar not found", poem::http::StatusCode::NOT_FOUND))
}
