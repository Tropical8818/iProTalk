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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[oai(default)]
    pub reply_to: Option<String>,          // message ID being replied to
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[oai(default)]
    pub reply_to_preview: Option<String>,  // quoted preview text of the replied message
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    #[oai(default)]
    pub mentions: Vec<String>,             // @mentioned user IDs
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[oai(default)]
    pub content_type: Option<String>,      // "text", "image", "file", "audio", "video", etc.
}

/// Generic realtime event sent over SSE.  All variants are serialised as JSON.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "event_type", rename_all = "snake_case")]
pub enum RealtimeEvent {
    /// A new, edited, deleted, or forwarded message
    NewMessage {
        payload: MessagePayload,
        timestamp: i64,
    },
    EditMessage {
        payload: MessagePayload,
        timestamp: i64,
    },
    DeleteMessage {
        message_id: String,
        timestamp: i64,
    },
    DmMessage {
        payload: MessagePayload,
        timestamp: i64,
    },
    /// Emoji reaction added/removed on a message
    Reaction {
        message_id: String,
        user_id: String,
        emoji: String,
        action: String, // "add" | "remove"
        timestamp: i64,
    },
    /// Typing indicator
    Typing {
        user_id: String,
        channel_id: Option<String>,
        recipient_id: Option<String>,
        is_typing: bool,
        timestamp: i64,
    },
    /// User presence change
    Presence {
        user_id: String,
        is_online: bool,
        timestamp: i64,
    },
    /// @mention notification
    Mention {
        message_id: String,
        sender_id: String,
        mentioned_user_id: String,
        channel_id: Option<String>,
        timestamp: i64,
    },
}


