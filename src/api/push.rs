use poem::{web::Data, Result, error::InternalServerError, http::StatusCode};
use poem_openapi::{OpenApi, payload::Json, Object, param::Header};
use crate::{db::AppState, models::PushSubscriptionRequest, api::utils::decode_user_id_from_token};
use uuid::Uuid;
use serde::{Deserialize, Serialize};
use web_push::{VapidSignatureBuilder, WebPushMessageBuilder, SubscriptionInfo, ContentEncoding, IsahcWebPushClient, WebPushClient};

#[derive(Clone, Default)]
pub struct PushApi;

#[derive(Debug, Object, Serialize, Deserialize)]
pub struct VapidPublicKeyResponse {
    pub public_key: String,
}

#[OpenApi]
impl PushApi {
    /// Get the server's VAPID public key for push subscriptions
    #[oai(path = "/push/vapid-key", method = "get")]
    async fn get_vapid_key(&self, state: Data<&AppState>) -> Result<Json<VapidPublicKeyResponse>> {
        let row = sqlx::query("SELECT value FROM settings WHERE key = 'vapid_public_key'")
            .fetch_optional(&state.sql_pool)
            .await
            .map_err(InternalServerError)?;

        if let Some(row) = row {
            let public_key: String = sqlx::Row::get(&row, "value");
            Ok(Json(VapidPublicKeyResponse { public_key }))
        } else {
            // Generate new VAPID keys if they don't exist
            let (private_key, public_key) = generate_vapid_keys()?;
            
            sqlx::query("INSERT INTO settings (key, value) VALUES ('vapid_private_key', ?), ('vapid_public_key', ?)")
                .bind(&private_key)
                .bind(&public_key)
                .execute(&state.sql_pool)
                .await
                .map_err(InternalServerError)?;

            Ok(Json(VapidPublicKeyResponse { public_key }))
        }
    }

    /// Subscribe to push notifications
    #[oai(path = "/push/subscribe", method = "post")]
    async fn subscribe(
        &self,
        state: Data<&AppState>,
        #[oai(name = "Authorization")] auth_header: Header<Option<String>>,
        req: Json<PushSubscriptionRequest>,
    ) -> Result<Json<String>> {
        let auth_token = auth_header.0.ok_or_else(|| poem::Error::from_status(StatusCode::UNAUTHORIZED))?;
        let user_id = decode_user_id_from_token(&auth_token).map_err(|_| poem::Error::from_status(StatusCode::UNAUTHORIZED))?;

        let id = Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth) 
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(user_id, endpoint) DO UPDATE SET p256dh=excluded.p256dh, auth=excluded.auth"
        )
        .bind(&id)
        .bind(&user_id)
        .bind(&req.0.endpoint)
        .bind(&req.0.p256dh)
        .bind(&req.0.auth)
        .execute(&state.sql_pool)
        .await
        .map_err(InternalServerError)?;

        Ok(Json("subscribed".to_string()))
    }

    /// Unsubscribe from push notifications
    #[oai(path = "/push/unsubscribe", method = "post")]
    async fn unsubscribe(
        &self,
        state: Data<&AppState>,
        #[oai(name = "Authorization")] auth_header: Header<Option<String>>,
        req: Json<PushSubscriptionRequest>,
    ) -> Result<Json<String>> {
        let auth_token = auth_header.0.ok_or_else(|| poem::Error::from_status(StatusCode::UNAUTHORIZED))?;
        let user_id = decode_user_id_from_token(&auth_token).map_err(|_| poem::Error::from_status(StatusCode::UNAUTHORIZED))?;

        sqlx::query("DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?")
            .bind(&user_id)
            .bind(&req.0.endpoint)
            .execute(&state.sql_pool)
            .await
            .map_err(InternalServerError)?;

        Ok(Json("unsubscribed".to_string()))
    }
}

fn generate_vapid_keys() -> Result<(String, String)> {
    use rand::RngCore;
    let mut priv_bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut priv_bytes);
    let private_key = base64::Engine::encode(&base64::engine::general_purpose::URL_SAFE_NO_PAD, priv_bytes);
    
    let sig_builder = VapidSignatureBuilder::from_base64_no_sub(&private_key, web_push::URL_SAFE_NO_PAD)
        .map_err(|e| poem::Error::from_string(format!("VAPID key error: {:?}", e), StatusCode::INTERNAL_SERVER_ERROR))?;
    let pub_key_bytes = sig_builder.get_public_key();
    let public_key = base64::Engine::encode(&base64::engine::general_purpose::URL_SAFE_NO_PAD, pub_key_bytes);
    
    Ok((private_key, public_key))
}

pub async fn send_push_notification(
    state: &AppState,
    user_id: &str,
    title: &str,
    body: &str,
    url: &str,
) -> Result<()> {
    // 1. Get subscriptions for user
    let rows = sqlx::query("SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?")
        .bind(user_id)
        .fetch_all(&state.sql_pool)
        .await
        .map_err(InternalServerError)?;

    if rows.is_empty() {
        return Ok(());
    }

    // 2. Get VAPID keys
    let priv_key_row = sqlx::query("SELECT value FROM settings WHERE key = 'vapid_private_key'")
        .fetch_optional(&state.sql_pool)
        .await
        .map_err(InternalServerError)?;
    
    let priv_key: String = match priv_key_row {
        Some(row) => sqlx::Row::get(&row, "value"),
        None => return Ok(()), // No push if keys not configured
    };

    let client = IsahcWebPushClient::new().map_err(InternalServerError)?;
    
    for row in rows {
        let endpoint: String = sqlx::Row::get(&row, "endpoint");
        let p256dh: String = sqlx::Row::get(&row, "p256dh");
        let auth: String = sqlx::Row::get(&row, "auth");

        let subscription_info = SubscriptionInfo::new(
            endpoint,
            p256dh,
            auth,
        );

        let payload = serde_json::json!({
            "title": title,
            "body": body,
            "url": url,
            "tag": "iprotalk-msg"
        });

        let mut builder = WebPushMessageBuilder::new(&subscription_info);
        let payload_str = payload.to_string();
        builder.set_payload(ContentEncoding::Aes128Gcm, payload_str.as_bytes());

        let vapid_signature = VapidSignatureBuilder::from_base64(&priv_key, web_push::URL_SAFE_NO_PAD, &subscription_info)
            .map_err(InternalServerError)?
            .build()
            .map_err(InternalServerError)?;
            
        builder.set_vapid_signature(vapid_signature);

        let message = builder.build().map_err(InternalServerError)?;
        
        // Send asynchronously
        let client_clone = client.clone();
        tokio::spawn(async move {
            if let Err(e) = client_clone.send(message).await {
                tracing::error!("Failed to send push notification: {:?}", e);
            }
        });
    }

    Ok(())
}
