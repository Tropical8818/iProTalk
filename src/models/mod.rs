use serde::{Deserialize, Serialize};
use poem_openapi::Object;

#[derive(Debug, Object, Serialize, Deserialize)]
pub struct RegisterRequest {
    pub email: String,
    pub password: String,
    pub name: String,
}

#[derive(Debug, Object, Serialize, Deserialize)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

#[derive(Debug, Object, Serialize, Deserialize)]
pub struct AuthResponse {
    pub token: String,
    pub user_id: String,
    pub name: String,
}

#[derive(Debug, Object, Serialize, Deserialize)]
pub struct UserKeyRequest {
    pub public_key: String,      // Base64
    pub signed_pre_key: Option<String>, // Base64
}

#[derive(Debug, Object, Serialize, Deserialize)]
pub struct UserKeyResponse {
    pub user_id: String,
    pub public_key: String,
    pub signed_pre_key: Option<String>,
}

#[derive(Debug, Object, Serialize, Deserialize, Clone)]
pub struct MessagePayload {
    pub encrypted_blob: String, // Base64
    pub nonce: String,          // Base64
    pub sender_id: String,
    pub group_id: Option<String>,
    pub recipient_id: Option<String>,
}

#[derive(Debug, Object, Serialize, Deserialize, Clone)]
pub struct MessageEvent {
    pub event_type: String, // "new_message"
    pub payload: MessagePayload,
    pub timestamp: i64,
}
