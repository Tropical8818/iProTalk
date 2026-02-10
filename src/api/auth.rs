use poem::{web::Data, Result, error::InternalServerError};
use poem_openapi::{OpenApi, payload::Json};
use crate::{db::AppState, models::{RegisterRequest, LoginRequest, AuthResponse}};
use uuid::Uuid;
use bcrypt::{hash, verify, DEFAULT_COST};
use jsonwebtoken::{encode, Header, EncodingKey};
use serde::{Deserialize, Serialize};
use sqlx::Row; // Import Row trait

#[derive(Clone, Default)]
pub struct AuthApi;

#[derive(Debug, Serialize, Deserialize)]
struct Claims {
    sub: String, // user_id
    exp: usize,
}

#[OpenApi]
impl AuthApi {
    #[oai(path = "/auth/register", method = "post")]
    async fn register(
        &self,
        state: Data<&AppState>,
        req: Json<RegisterRequest>,
    ) -> Result<Json<AuthResponse>> {
        let user_id = Uuid::new_v4().to_string();
        let hashed = hash(&req.0.password, DEFAULT_COST).map_err(InternalServerError)?;

        // Insert into DB
        let result = sqlx::query(
            "INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)"
        )
        .bind(&user_id)
        .bind(&req.0.email)
        .bind(&hashed)
        .bind(&req.0.name)
        .execute(&state.sql_pool)
        .await;

        match result {
            Ok(_) => {
                let token = create_token(&user_id)?;
                Ok(Json(AuthResponse {
                    token,
                    user_id,
                    name: req.0.name,
                }))
            },
            Err(e) => {
                // Check if duplicate email (constraint violation)
                if e.to_string().contains("UNIQUE constraint failed") {
                     return Err(poem::Error::from_string("Email already exists", poem::http::StatusCode::BAD_REQUEST));
                }
                Err(InternalServerError(e))
            }
        }
    }

    #[oai(path = "/auth/login", method = "post")]
    async fn login(
        &self,
        state: Data<&AppState>,
        req: Json<LoginRequest>,
    ) -> Result<Json<AuthResponse>> {
        let row = sqlx::query(
            "SELECT id, password_hash, name FROM users WHERE email = ?"
        )
        .bind(&req.0.email)
        .fetch_optional(&state.sql_pool)
        .await
        .map_err(InternalServerError)?;

        if let Some(row) = row {
            let user_id: String = row.get("id");
            let hash: String = row.get("password_hash");
            let name: String = row.get("name");

            if verify(&req.0.password, &hash).map_err(InternalServerError)? {
                let token = create_token(&user_id)?;
                Ok(Json(AuthResponse {
                    token,
                    user_id,
                    name,
                }))
            } else {
                 Err(poem::Error::from_string("Invalid credentials", poem::http::StatusCode::BAD_REQUEST))
            }
        } else {
             Err(poem::Error::from_string("User not found", poem::http::StatusCode::BAD_REQUEST))
        }
    }
}

fn create_token(user_id: &str) -> Result<String> {
    let expiration = chrono::Utc::now()
        .checked_add_signed(chrono::Duration::hours(24))
        .expect("valid timestamp")
        .timestamp();

    let claims = Claims {
        sub: user_id.to_owned(),
        exp: expiration as usize,
    };
    
    // Use env var for secret
    let secret = std::env::var("SECRET_KEY").unwrap_or_else(|_| "secret_key".to_string()); 
    encode(&Header::default(), &claims, &EncodingKey::from_secret(secret.as_ref()))
        .map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::INTERNAL_SERVER_ERROR))
}
