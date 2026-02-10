use poem::{web::Data, Result, handler, error::{InternalServerError}};
use poem_openapi::{OpenApi, payload::Json, param::{Path, Header}, ApiResponse};
use crate::{db::AppState, models::{UserKeyRequest, UserKeyResponse}};
use sqlx::Row;

#[derive(Clone, Default)]
pub struct KeysApi;

#[OpenApi]
impl KeysApi {
    #[oai(path = "/users/keys", method = "post")]
    async fn upload_keys(
        &self,
        state: Data<&AppState>,
        req: Json<UserKeyRequest>,
        // In a real implementation, we would use a Bearer auth extractor
        #[oai(name = "Authorization")] auth_header: Header<Option<String>>,
    ) -> Result<Json<String>> {
        // Simple mock auth check (should verify JWT)
        let token = auth_header.0.ok_or(poem::Error::from_string("Missing Auth Token", poem::http::StatusCode::FORBIDDEN))?;
        let _jwt = token.trim_start_matches("Bearer ");
        // TODO: Validate JWT and extract user_id. 
        // For MVP speed, let's assume the user sends their ID in the request or we mock it.
        // But wait, the request doesn't have user_id.
        // Let's decode the token insecurely for now just to get the 'sub'.
        
        let user_id = decode_user_id_from_token(_jwt).map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::FORBIDDEN))?;

        sqlx::query(
            "INSERT INTO user_keys (user_id, public_key, signed_pre_key) VALUES (?, ?, ?)
             ON CONFLICT(user_id) DO UPDATE SET public_key = excluded.public_key, signed_pre_key = excluded.signed_pre_key, updated_at = CURRENT_TIMESTAMP"
        )
        .bind(&user_id)
        .bind(&req.0.public_key)
        .bind(&req.0.signed_pre_key)
        .execute(&state.sql_pool)
        .await
        .map_err(InternalServerError)?;

        Ok(Json("Keys uploaded/updated".to_string()))
    }

    #[oai(path = "/users/:user_id/keys", method = "get")]
    async fn get_keys(
        &self,
        state: Data<&AppState>,
        user_id: Path<String>,
    ) -> Result<Json<UserKeyResponse>> {
        let row = sqlx::query(
            "SELECT public_key, signed_pre_key FROM user_keys WHERE user_id = ?"
        )
        .bind(&user_id.0)
        .fetch_optional(&state.sql_pool)
        .await
        .map_err(InternalServerError)?;

        if let Some(row) = row {
            Ok(Json(UserKeyResponse {
                user_id: user_id.0,
                public_key: row.get("public_key"),
                signed_pre_key: row.get("signed_pre_key"),
            }))
        } else {
             Err(poem::Error::from_string("Keys not found for user", poem::http::StatusCode::NOT_FOUND))
        }
    }
}

// Helper to extract user_id from JWT (without validation for MVP simplicity, or with basic validation)
fn decode_user_id_from_token(token: &str) -> anyhow::Result<String> {
    use jsonwebtoken::{decode, Validation, DecodingKey};
    use serde::Deserialize;

    #[derive(Deserialize)]
    struct Claims {
        sub: String,
    }

    let secret = "secret_key";
    let token_data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_ref()),
        &Validation::default(),
    )?;
    
    Ok(token_data.claims.sub)
}
