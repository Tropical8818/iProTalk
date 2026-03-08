use serde::{Deserialize, Serialize};
use poem_openapi::Object;

#[derive(Debug, Object, Serialize, Deserialize, Clone)]
pub struct ForwardInfo {
    pub original_message_id: String,
    pub original_sender_id: String,
    pub original_sender_name: String,
    pub original_timestamp: i64,
}

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
    pub e2ee_initialized: bool,
    pub is_admin: bool,
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
    pub recipient_keys: std::collections::HashMap<String, String>, // user_id -> encrypted session key Base64
    #[serde(skip_serializing_if = "Option::is_none")]
    pub forward_info: Option<ForwardInfo>,
}

#[derive(Debug, Object, Serialize, Deserialize, Clone)]
pub struct MessageEvent {
    pub event_type: String, // "new_message"
    pub payload: MessagePayload,
    pub timestamp: i64,
}
