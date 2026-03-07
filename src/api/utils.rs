use jsonwebtoken::{decode, Validation, DecodingKey};
use serde::Deserialize;

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
