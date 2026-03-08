use poem::{web::Data, Result, error::InternalServerError};
use poem_openapi::{OpenApi, payload::Json, param::{Path, Header}, Object};
use serde::{Deserialize, Serialize};
use crate::{db::AppState, api::utils::decode_user_id_from_token};
use uuid::Uuid;
use sqlx::Row;

#[derive(Clone, Default)]
pub struct ChannelsApi;

#[derive(Debug, Object, Serialize, Deserialize)]
pub struct ChannelResponse {
    pub id: String,
    pub name: String,
    pub description: String,
    pub is_public: bool,
    pub announcement: String,
    pub created_by: String,
    pub created_at: i64,
}

#[derive(Debug, Object, Serialize, Deserialize)]
pub struct CreateChannelReq {
    pub name: String,
    pub description: Option<String>,
    pub is_public: Option<bool>,
}

#[derive(Debug, Object, Serialize, Deserialize)]
pub struct UpdateChannelReq {
    pub name: Option<String>,
    pub description: Option<String>,
}

#[derive(Debug, Object, Serialize, Deserialize)]
pub struct ChannelMember {
    pub user_id: String,
    pub name: String,
    pub role: String,
}

#[derive(Debug, Object, Deserialize)]
pub struct SetAnnouncementReq {
    pub announcement: String,
}

#[OpenApi]
impl ChannelsApi {
    #[oai(path = "/channels", method = "get")]
    async fn get_channels(
        &self,
        state: Data<&AppState>,
        #[oai(name = "Authorization")] auth_header: Header<Option<String>>,
    ) -> Result<Json<Vec<ChannelResponse>>> {
        let _token = auth_header.0.ok_or(poem::Error::from_string("Missing Auth Token", poem::http::StatusCode::FORBIDDEN))?;

        let rows = sqlx::query(
            "SELECT id, name, description, is_public, COALESCE(announcement, '') as announcement, created_by, strftime('%s', created_at) as created_at FROM channels"
        )
        .fetch_all(&state.sql_pool)
        .await
        .map_err(InternalServerError)?;

        let mut channels = Vec::new();
        for row in rows {
            let created_at: String = row.get("created_at");
            channels.push(ChannelResponse {
                id: row.get("id"),
                name: row.get("name"),
                description: row.get("description"),
                is_public: row.get("is_public"),
                announcement: row.get("announcement"),
                created_by: row.get("created_by"),
                created_at: created_at.parse().unwrap_or(0),
            });
        }

        Ok(Json(channels))
    }

    #[oai(path = "/channels", method = "post")]
    async fn create_channel(
        &self,
        state: Data<&AppState>,
        req: Json<CreateChannelReq>,
        #[oai(name = "Authorization")] auth_header: Header<Option<String>>,
    ) -> Result<Json<ChannelResponse>> {
        let token = auth_header.0.ok_or(poem::Error::from_string("Missing Auth Token", poem::http::StatusCode::FORBIDDEN))?;
        let user_id = decode_user_id_from_token(&token)
            .map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::FORBIDDEN))?;

        let cid = Uuid::new_v4().to_string();
        let description = req.0.description.unwrap_or_default();
        let is_public = req.0.is_public.unwrap_or(true);

        sqlx::query(
            "INSERT INTO channels (id, name, description, is_public, created_by) VALUES (?, ?, ?, ?, ?)"
        )
        .bind(&cid)
        .bind(&req.0.name)
        .bind(&description)
        .bind(is_public)
        .bind(&user_id)
        .execute(&state.sql_pool)
        .await
        .map_err(InternalServerError)?;

        // Auto-join creator as owner
        sqlx::query("INSERT OR IGNORE INTO group_members (group_id, user_id, role) VALUES (?, ?, 'owner')")
            .bind(&cid).bind(&user_id)
            .execute(&state.sql_pool).await.ok();

        Ok(Json(ChannelResponse {
            id: cid,
            name: req.0.name,
            description,
            is_public,
            announcement: String::new(),
            created_by: user_id,
            created_at: chrono::Utc::now().timestamp(),
        }))
    }

    #[oai(path = "/channels/:id", method = "put")]
    async fn update_channel(
        &self,
        state: Data<&AppState>,
        id: Path<String>,
        req: Json<UpdateChannelReq>,
        #[oai(name = "Authorization")] auth_header: Header<Option<String>>,
    ) -> Result<Json<String>> {
        let token = auth_header.0.ok_or(poem::Error::from_string("Missing Auth Token", poem::http::StatusCode::FORBIDDEN))?;
        let user_id = decode_user_id_from_token(&token)
            .map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::FORBIDDEN))?;

        // Check if user is admin or owner
        let is_admin = crate::api::utils::check_is_admin(&state.sql_pool, &user_id).await;
        let is_owner = sqlx::query("SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ? AND role = 'owner'")
            .bind(&id.0).bind(&user_id).fetch_optional(&state.sql_pool).await.unwrap_or(None).is_some();

        if !is_admin && !is_owner {
            return Err(poem::Error::from_string("Permission Denied: Only admins or owners can update channels", poem::http::StatusCode::FORBIDDEN));
        }

        if let Some(name) = &req.0.name {
            sqlx::query("UPDATE channels SET name = ? WHERE id = ?")
                .bind(name).bind(&id.0)
                .execute(&state.sql_pool).await.map_err(InternalServerError)?;
        }

        if let Some(desc) = &req.0.description {
            sqlx::query("UPDATE channels SET description = ? WHERE id = ?")
                .bind(desc).bind(&id.0)
                .execute(&state.sql_pool).await.map_err(InternalServerError)?;
        }

        Ok(Json("Updated".to_string()))
    }

    #[oai(path = "/channels/:id", method = "delete")]
    async fn delete_channel(
        &self,
        state: Data<&AppState>,
        id: Path<String>,
        #[oai(name = "Authorization")] auth_header: Header<Option<String>>,
    ) -> Result<Json<String>> {
        let token = auth_header.0.ok_or(poem::Error::from_string("Missing Auth Token", poem::http::StatusCode::FORBIDDEN))?;
        let user_id = decode_user_id_from_token(&token)
            .map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::FORBIDDEN))?;

        let is_admin = crate::api::utils::check_is_admin(&state.sql_pool, &user_id).await;
        if !is_admin {
            return Err(poem::Error::from_string("Permission Denied: Only admins can delete channels", poem::http::StatusCode::FORBIDDEN));
        }

        sqlx::query("DELETE FROM channels WHERE id = ?")
            .bind(&id.0)
            .execute(&state.sql_pool).await.map_err(InternalServerError)?;

        Ok(Json("Deleted".to_string()))
    }

    /// 获取频道成员列表
    #[oai(path = "/channels/:id/members", method = "get")]
    async fn get_channel_members(
        &self,
        state: Data<&AppState>,
        id: Path<String>,
        #[oai(name = "Authorization")] auth_header: Header<Option<String>>,
    ) -> Result<Json<Vec<ChannelMember>>> {
        let _token = auth_header.0.ok_or(poem::Error::from_string("Missing Auth Token", poem::http::StatusCode::FORBIDDEN))?;

        let rows = sqlx::query(
            "SELECT gm.user_id, u.name, gm.role FROM group_members gm JOIN users u ON gm.user_id = u.id WHERE gm.group_id = ?"
        )
        .bind(&id.0)
        .fetch_all(&state.sql_pool)
        .await
        .map_err(InternalServerError)?;

        let members: Vec<ChannelMember> = rows.iter().map(|r| ChannelMember {
            user_id: r.get("user_id"),
            name: r.get("name"),
            role: r.get("role"),
        }).collect();

        Ok(Json(members))
    }

    /// 加入频道
    #[oai(path = "/channels/:id/join", method = "post")]
    async fn join_channel(
        &self,
        state: Data<&AppState>,
        id: Path<String>,
        #[oai(name = "Authorization")] auth_header: Header<Option<String>>,
    ) -> Result<Json<String>> {
        let token = auth_header.0.ok_or(poem::Error::from_string("Missing Auth Token", poem::http::StatusCode::FORBIDDEN))?;
        let user_id = decode_user_id_from_token(&token)
            .map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::FORBIDDEN))?;

        sqlx::query("INSERT OR IGNORE INTO group_members (group_id, user_id, role) VALUES (?, ?, 'member')")
            .bind(&id.0).bind(&user_id)
            .execute(&state.sql_pool).await.map_err(InternalServerError)?;

        Ok(Json("Joined".to_string()))
    }

    /// 离开频道
    #[oai(path = "/channels/:id/leave", method = "post")]
    async fn leave_channel(
        &self,
        state: Data<&AppState>,
        id: Path<String>,
        #[oai(name = "Authorization")] auth_header: Header<Option<String>>,
    ) -> Result<Json<String>> {
        let token = auth_header.0.ok_or(poem::Error::from_string("Missing Auth Token", poem::http::StatusCode::FORBIDDEN))?;
        let user_id = decode_user_id_from_token(&token)
            .map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::FORBIDDEN))?;

        sqlx::query("DELETE FROM group_members WHERE group_id = ? AND user_id = ?")
            .bind(&id.0).bind(&user_id)
            .execute(&state.sql_pool).await.map_err(InternalServerError)?;

        Ok(Json("Left".to_string()))
    }

    /// 设置频道公告
    #[oai(path = "/channels/:id/announcement", method = "put")]
    async fn set_announcement(
        &self,
        state: Data<&AppState>,
        id: Path<String>,
        req: Json<SetAnnouncementReq>,
        #[oai(name = "Authorization")] auth_header: Header<Option<String>>,
    ) -> Result<Json<String>> {
        let token = auth_header.0.ok_or(poem::Error::from_string("Missing Auth Token", poem::http::StatusCode::FORBIDDEN))?;
        let user_id = decode_user_id_from_token(&token)
            .map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::FORBIDDEN))?;

        let is_admin = crate::api::utils::check_is_admin(&state.sql_pool, &user_id).await;
        let is_owner = sqlx::query("SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ? AND role = 'owner'")
            .bind(&id.0).bind(&user_id).fetch_optional(&state.sql_pool).await.unwrap_or(None).is_some();

        if !is_admin && !is_owner {
            return Err(poem::Error::from_string("Permission Denied: Only admins or owners can set announcements", poem::http::StatusCode::FORBIDDEN));
        }

        sqlx::query("UPDATE channels SET announcement = ? WHERE id = ?")
            .bind(&req.0.announcement).bind(&id.0)
            .execute(&state.sql_pool).await.map_err(InternalServerError)?;

        Ok(Json("Announcement updated".to_string()))
    }

    /// 获取频道公告
    #[oai(path = "/channels/:id/announcement", method = "get")]
    async fn get_announcement(
        &self,
        state: Data<&AppState>,
        id: Path<String>,
        #[oai(name = "Authorization")] auth_header: Header<Option<String>>,
    ) -> Result<Json<String>> {
        let _token = auth_header.0.ok_or(poem::Error::from_string("Missing Auth Token", poem::http::StatusCode::FORBIDDEN))?;

        let row = sqlx::query("SELECT COALESCE(announcement, '') as announcement FROM channels WHERE id = ?")
            .bind(&id.0)
            .fetch_optional(&state.sql_pool)
            .await
            .map_err(InternalServerError)?;

        let announcement = row.map(|r| r.get::<String, _>("announcement")).unwrap_or_default();
        Ok(Json(announcement))
    }
}
