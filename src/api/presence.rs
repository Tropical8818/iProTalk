use poem::{web::Data, Result};
use poem_openapi::{OpenApi, payload::Json, param::Header, Object};
use serde::{Deserialize, Serialize};
use crate::{db::AppState, models::RealtimeEvent, api::utils::decode_user_id_from_token};

#[derive(Clone, Default)]
pub struct PresenceApi;

/// How many seconds of inactivity before a user is considered offline
const ONLINE_TIMEOUT_SECS: i64 = 60;

#[derive(Debug, Object, Serialize, Deserialize)]
pub struct OnlineUser {
    pub user_id: String,
    pub last_seen: i64,
}

#[OpenApi]
impl PresenceApi {
    /// 上报心跳，保持在线状态（每 30 秒调用一次）
    #[oai(path = "/users/heartbeat", method = "post")]
    async fn heartbeat(
        &self,
        state: Data<&AppState>,
        #[oai(name = "Authorization")] auth_header: Header<Option<String>>,
    ) -> Result<Json<String>> {
        let token = auth_header.0.ok_or(poem::Error::from_string(
            "Missing Auth Token",
            poem::http::StatusCode::FORBIDDEN,
        ))?;
        let user_id = decode_user_id_from_token(&token)
            .map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::FORBIDDEN))?;

        let now = chrono::Utc::now().timestamp();

        let was_offline = {
            let map = state.online_users.read().await;
            map.get(&user_id)
                .map(|&ts| now - ts > ONLINE_TIMEOUT_SECS)
                .unwrap_or(true)
        };

        {
            let mut map = state.online_users.write().await;
            map.insert(user_id.clone(), now);
        }

        // Broadcast presence event only when the user transitions to online
        if was_offline {
            let _ = state.sender.send(RealtimeEvent::Presence {
                user_id,
                is_online: true,
                timestamp: now,
            });
        }

        Ok(Json("ok".to_string()))
    }

    /// 获取当前在线用户列表（最近 60 秒内有心跳）
    #[oai(path = "/users/online", method = "get")]
    async fn get_online_users(
        &self,
        state: Data<&AppState>,
        #[oai(name = "Authorization")] auth_header: Header<Option<String>>,
    ) -> Result<Json<Vec<OnlineUser>>> {
        let _token = auth_header.0.ok_or(poem::Error::from_string(
            "Missing Auth Token",
            poem::http::StatusCode::FORBIDDEN,
        ))?;

        let now = chrono::Utc::now().timestamp();
        let map = state.online_users.read().await;

        let online: Vec<OnlineUser> = map
            .iter()
            .filter(|(_, &ts)| now - ts <= ONLINE_TIMEOUT_SECS)
            .map(|(uid, &ts)| OnlineUser {
                user_id: uid.clone(),
                last_seen: ts,
            })
            .collect();

        Ok(Json(online))
    }

    /// 主动下线（退出登录或关闭标签页时调用）
    #[oai(path = "/users/offline", method = "post")]
    async fn go_offline(
        &self,
        state: Data<&AppState>,
        #[oai(name = "Authorization")] auth_header: Header<Option<String>>,
    ) -> Result<Json<String>> {
        let token = auth_header.0.ok_or(poem::Error::from_string(
            "Missing Auth Token",
            poem::http::StatusCode::FORBIDDEN,
        ))?;
        let user_id = decode_user_id_from_token(&token)
            .map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::FORBIDDEN))?;

        {
            let mut map = state.online_users.write().await;
            map.remove(&user_id);
        }

        let _ = state.sender.send(RealtimeEvent::Presence {
            user_id,
            is_online: false,
            timestamp: chrono::Utc::now().timestamp(),
        });

        Ok(Json("ok".to_string()))
    }
}
