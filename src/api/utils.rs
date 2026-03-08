use jsonwebtoken::{decode, Validation, DecodingKey};
use serde::Deserialize;
use sqlx::Row;

#[derive(Deserialize)]
struct Claims {
    sub: String,
    exp: usize,
}

pub fn decode_user_id_from_token(token: &str) -> anyhow::Result<String> {
    let secret = std::env::var("SECRET_KEY").unwrap_or_else(|_| "secret_key".to_string());
    
    // Clean up "Bearer " prefix if present before decoding
    let clean_token = token.trim_start_matches("Bearer ");
    
    let token_data = decode::<Claims>(
        clean_token,
        &DecodingKey::from_secret(secret.as_ref()),
        &Validation::default(),
    )?;
    
    Ok(token_data.claims.sub)
}

pub async fn check_is_admin(pool: &sqlx::SqlitePool, user_id: &str) -> bool {
    let row = sqlx::query("SELECT is_admin FROM users WHERE id = ?")
        .bind(user_id)
        .fetch_optional(pool)
        .await
        .unwrap_or(None);
    
    row.map(|r| r.get::<bool, _>("is_admin")).unwrap_or(false)
}
