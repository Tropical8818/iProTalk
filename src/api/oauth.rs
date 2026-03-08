use poem::web::Data;
use poem_openapi::{OpenApi, param::Query, payload::Json, ApiResponse, Object};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use uuid::Uuid;

use crate::db::AppState;

#[derive(Clone, Default)]
pub struct OAuthApi;

// ── Response types ────────────────────────────────────────────────────────────

#[derive(Debug, Object, Serialize)]
pub struct OAuthTokenResponse {
    pub token: String,
    pub user_id: String,
    pub name: String,
}

#[derive(ApiResponse)]
pub enum AuthorizeResponse {
    /// Redirect to OAuth provider
    #[oai(status = 302)]
    Redirect(#[oai(header = "Location")] String),
    /// OAuth provider not configured
    #[oai(status = 501)]
    NotImplemented(Json<String>),
    /// Internal error
    #[oai(status = 500)]
    InternalError(Json<String>),
}

#[derive(ApiResponse)]
pub enum CallbackResponse {
    #[oai(status = 200)]
    Ok(Json<OAuthTokenResponse>),
    #[oai(status = 400)]
    BadRequest(Json<String>),
    #[oai(status = 501)]
    NotImplemented(Json<String>),
    #[oai(status = 502)]
    BadGateway(Json<String>),
    #[oai(status = 500)]
    InternalError(Json<String>),
}

// ── GitHub API response shapes ────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct GitHubTokenResp {
    access_token: Option<String>,
    error: Option<String>,
    error_description: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GitHubUser {
    id: i64,
    login: String,
    name: Option<String>,
    email: Option<String>,
}

#[derive(Debug, Deserialize, Default)]
struct GitHubEmail {
    email: String,
    primary: bool,
    verified: bool,
}

// ── Google API response shapes ────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct GoogleTokenResp {
    access_token: Option<String>,
    error: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GoogleUserInfo {
    sub: String,
    name: Option<String>,
    email: Option<String>,
}

// ── JWT helper ────────────────────────────────────────────────────────────────

use jsonwebtoken::{encode, Header, EncodingKey};

#[derive(Debug, Serialize, Deserialize)]
struct Claims {
    sub: String,
    exp: usize,
}

fn create_token(user_id: &str) -> anyhow::Result<String> {
    let expiration = chrono::Utc::now()
        .checked_add_signed(chrono::Duration::hours(24))
        .expect("valid timestamp")
        .timestamp();
    let claims = Claims {
        sub: user_id.to_owned(),
        exp: expiration as usize,
    };
    let secret = std::env::var("SECRET_KEY").unwrap_or_else(|_| "secret_key".to_string());
    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_ref()),
    )
    .map_err(|e| anyhow::anyhow!(e.to_string()))
}

// ── Shared: find-or-create a user by OAuth provider/id ───────────────────────

async fn find_or_create_oauth_user(
    pool: &sqlx::SqlitePool,
    provider: &str,
    provider_id: &str,
    name: &str,
    email: Option<&str>,
) -> anyhow::Result<String> {
    // 1. Look up by (provider, provider_id)
    let existing = sqlx::query(
        "SELECT id FROM users WHERE oauth_provider = ? AND oauth_provider_id = ?",
    )
    .bind(provider)
    .bind(provider_id)
    .fetch_optional(pool)
    .await?;

    if let Some(row) = existing {
        return Ok(row.get("id"));
    }

    // 2. Try to link to existing email account
    if let Some(email_addr) = email {
        let by_email = sqlx::query("SELECT id FROM users WHERE email = ?")
            .bind(email_addr)
            .fetch_optional(pool)
            .await?;

        if let Some(row) = by_email {
            let user_id: String = row.get("id");
            sqlx::query(
                "UPDATE users SET oauth_provider = ?, oauth_provider_id = ? WHERE id = ?",
            )
            .bind(provider)
            .bind(provider_id)
            .bind(&user_id)
            .execute(pool)
            .await?;
            return Ok(user_id);
        }
    }

    // 3. Create new OAuth user (empty password_hash, NULL email if not provided)
    let user_id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO users (id, email, password_hash, name, oauth_provider, oauth_provider_id) \
         VALUES (?, ?, '', ?, ?, ?)",
    )
    .bind(&user_id)
    .bind(email)   // Option<&str> → NULL when None
    .bind(name)
    .bind(provider)
    .bind(provider_id)
    .execute(pool)
    .await?;

    Ok(user_id)
}

// ── reqwest client helper ─────────────────────────────────────────────────────

fn http_client() -> anyhow::Result<reqwest::Client> {
    reqwest::Client::builder()
        .build()
        .map_err(|e| anyhow::anyhow!(e.to_string()))
}

// ── OAuth state helpers ───────────────────────────────────────────────────────

async fn save_state(pool: &sqlx::SqlitePool, state: &str, provider: &str) -> anyhow::Result<()> {
    sqlx::query("INSERT INTO oauth_states (state, provider) VALUES (?, ?)")
        .bind(state)
        .bind(provider)
        .execute(pool)
        .await?;
    Ok(())
}

async fn validate_and_delete_state(pool: &sqlx::SqlitePool, state: &str) -> anyhow::Result<()> {
    // States expire after 10 minutes to prevent CSRF replay attacks
    let row = sqlx::query(
        "SELECT state FROM oauth_states WHERE state = ? \
         AND created_at >= datetime('now', '-10 minutes')",
    )
    .bind(state)
    .fetch_optional(pool)
    .await?;

    // Also clean up any expired states opportunistically
    let _ = sqlx::query(
        "DELETE FROM oauth_states WHERE created_at < datetime('now', '-10 minutes')",
    )
    .execute(pool)
    .await;

    if row.is_none() {
        return Err(anyhow::anyhow!("Invalid or expired OAuth state"));
    }

    sqlx::query("DELETE FROM oauth_states WHERE state = ?")
        .bind(state)
        .execute(pool)
        .await?;

    Ok(())
}

// ── URL-encoding helper ───────────────────────────────────────────────────────

fn url_encode(input: &str) -> String {
    let mut encoded = String::with_capacity(input.len());
    for byte in input.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                encoded.push(byte as char);
            }
            _ => {
                encoded.push_str(&format!("%{:02X}", byte));
            }
        }
    }
    encoded
}

// ── API ───────────────────────────────────────────────────────────────────────

#[OpenApi]
impl OAuthApi {
    /// Redirect to GitHub OAuth2 authorisation page.
    #[oai(path = "/auth/oauth2/github", method = "get")]
    async fn github_authorize(&self, state: Data<&AppState>) -> AuthorizeResponse {
        let client_id = match std::env::var("GITHUB_CLIENT_ID") {
            Ok(v) => v,
            Err(_) => return AuthorizeResponse::NotImplemented(Json("GitHub OAuth2 is not configured".to_string())),
        };
        let redirect_uri = std::env::var("GITHUB_REDIRECT_URI").unwrap_or_else(|_| {
            "http://localhost:3000/api/auth/oauth2/github/callback".to_string()
        });

        let csrf_state = Uuid::new_v4().to_string();
        if let Err(e) = save_state(&state.sql_pool, &csrf_state, "github").await {
            return AuthorizeResponse::InternalError(Json(e.to_string()));
        }

        let url = format!(
            "https://github.com/login/oauth/authorize?client_id={}&redirect_uri={}&scope=user:email&state={}",
            client_id,
            url_encode(&redirect_uri),
            csrf_state,
        );
        AuthorizeResponse::Redirect(url)
    }

    /// Handle GitHub OAuth2 callback and return a JWT.
    #[oai(path = "/auth/oauth2/github/callback", method = "get")]
    async fn github_callback(
        &self,
        state: Data<&AppState>,
        code: Query<Option<String>>,
        oauth_state: Query<Option<String>>,
    ) -> CallbackResponse {
        let client_id = match std::env::var("GITHUB_CLIENT_ID") {
            Ok(v) => v,
            Err(_) => return CallbackResponse::NotImplemented(Json("GitHub OAuth2 is not configured".to_string())),
        };
        let client_secret = match std::env::var("GITHUB_CLIENT_SECRET") {
            Ok(v) => v,
            Err(_) => return CallbackResponse::NotImplemented(Json("GitHub OAuth2 is not configured".to_string())),
        };
        let redirect_uri = std::env::var("GITHUB_REDIRECT_URI").unwrap_or_else(|_| {
            "http://localhost:3000/api/auth/oauth2/github/callback".to_string()
        });

        let code_val = match code.0 {
            Some(c) => c,
            None => return CallbackResponse::BadRequest(Json("Missing code parameter".to_string())),
        };
        let state_val = match oauth_state.0 {
            Some(s) => s,
            None => return CallbackResponse::BadRequest(Json("Missing state parameter".to_string())),
        };

        if let Err(e) = validate_and_delete_state(&state.sql_pool, &state_val).await {
            return CallbackResponse::BadRequest(Json(e.to_string()));
        }

        let client = match http_client() {
            Ok(c) => c,
            Err(e) => return CallbackResponse::InternalError(Json(e.to_string())),
        };

        // Exchange code for access_token
        let send_result = client
            .post("https://github.com/login/oauth/access_token")
            .header("Accept", "application/json")
            .form(&[
                ("client_id", client_id.as_str()),
                ("client_secret", client_secret.as_str()),
                ("code", code_val.as_str()),
                ("redirect_uri", redirect_uri.as_str()),
            ])
            .send()
            .await;
        let token_resp: GitHubTokenResp = match send_result {
            Ok(r) => match r.json().await {
                Ok(v) => v,
                Err(e) => return CallbackResponse::BadGateway(Json(e.to_string())),
            },
            Err(e) => return CallbackResponse::BadGateway(Json(e.to_string())),
        };

        if let Some(err) = token_resp.error {
            return CallbackResponse::BadRequest(Json(format!(
                "GitHub token error: {} — {}",
                err,
                token_resp.error_description.unwrap_or_default()
            )));
        }
        let access_token = match token_resp.access_token {
            Some(t) => t,
            None => return CallbackResponse::BadGateway(Json("No access_token in GitHub response".to_string())),
        };

        // Fetch user info
        let gh_user: GitHubUser = match client
            .get("https://api.github.com/user")
            .bearer_auth(&access_token)
            .header("User-Agent", "iProTalk")
            .send()
            .await
        {
            Ok(r) => match r.json().await {
                Ok(v) => v,
                Err(e) => return CallbackResponse::BadGateway(Json(e.to_string())),
            },
            Err(e) => return CallbackResponse::BadGateway(Json(e.to_string())),
        };

        // Fetch primary verified email if not on profile
        let email: Option<String> = if let Some(ref e) = gh_user.email {
            Some(e.clone())
        } else {
            match client
                .get("https://api.github.com/user/emails")
                .bearer_auth(&access_token)
                .header("User-Agent", "iProTalk")
                .send()
                .await
            {
                Ok(r) => {
                    match r.json::<Vec<GitHubEmail>>().await {
                        Ok(emails) => emails
                            .into_iter()
                            .find(|e| e.primary && e.verified)
                            .map(|e| e.email),
                        Err(e) => {
                            tracing::warn!("Failed to parse GitHub emails response: {}", e);
                            None
                        }
                    }
                }
                Err(e) => {
                    tracing::warn!("Failed to fetch GitHub emails: {}", e);
                    None
                }
            }
        };

        let provider_id = gh_user.id.to_string();
        let name = gh_user.name.unwrap_or_else(|| gh_user.login.clone());

        let user_id = match find_or_create_oauth_user(
            &state.sql_pool, "github", &provider_id, &name, email.as_deref(),
        ).await {
            Ok(id) => id,
            Err(e) => return CallbackResponse::InternalError(Json(e.to_string())),
        };

        let token = match create_token(&user_id) {
            Ok(t) => t,
            Err(e) => return CallbackResponse::InternalError(Json(e.to_string())),
        };

        CallbackResponse::Ok(Json(OAuthTokenResponse { token, user_id, name }))
    }

    /// Redirect to Google OAuth2 authorisation page.
    #[oai(path = "/auth/oauth2/google", method = "get")]
    async fn google_authorize(&self, state: Data<&AppState>) -> AuthorizeResponse {
        let client_id = match std::env::var("GOOGLE_CLIENT_ID") {
            Ok(v) => v,
            Err(_) => return AuthorizeResponse::NotImplemented(Json("Google OAuth2 is not configured".to_string())),
        };
        let redirect_uri = std::env::var("GOOGLE_REDIRECT_URI").unwrap_or_else(|_| {
            "http://localhost:3000/api/auth/oauth2/google/callback".to_string()
        });

        let csrf_state = Uuid::new_v4().to_string();
        if let Err(e) = save_state(&state.sql_pool, &csrf_state, "google").await {
            return AuthorizeResponse::InternalError(Json(e.to_string()));
        }

        let url = format!(
            "https://accounts.google.com/o/oauth2/v2/auth?client_id={}&redirect_uri={}&response_type=code&scope=openid%20email%20profile&state={}",
            client_id,
            url_encode(&redirect_uri),
            csrf_state,
        );
        AuthorizeResponse::Redirect(url)
    }

    /// Handle Google OAuth2 callback and return a JWT.
    #[oai(path = "/auth/oauth2/google/callback", method = "get")]
    async fn google_callback(
        &self,
        state: Data<&AppState>,
        code: Query<Option<String>>,
        oauth_state: Query<Option<String>>,
    ) -> CallbackResponse {
        let client_id = match std::env::var("GOOGLE_CLIENT_ID") {
            Ok(v) => v,
            Err(_) => return CallbackResponse::NotImplemented(Json("Google OAuth2 is not configured".to_string())),
        };
        let client_secret = match std::env::var("GOOGLE_CLIENT_SECRET") {
            Ok(v) => v,
            Err(_) => return CallbackResponse::NotImplemented(Json("Google OAuth2 is not configured".to_string())),
        };
        let redirect_uri = std::env::var("GOOGLE_REDIRECT_URI").unwrap_or_else(|_| {
            "http://localhost:3000/api/auth/oauth2/google/callback".to_string()
        });

        let code_val = match code.0 {
            Some(c) => c,
            None => return CallbackResponse::BadRequest(Json("Missing code parameter".to_string())),
        };
        let state_val = match oauth_state.0 {
            Some(s) => s,
            None => return CallbackResponse::BadRequest(Json("Missing state parameter".to_string())),
        };

        if let Err(e) = validate_and_delete_state(&state.sql_pool, &state_val).await {
            return CallbackResponse::BadRequest(Json(e.to_string()));
        }

        let client = match http_client() {
            Ok(c) => c,
            Err(e) => return CallbackResponse::InternalError(Json(e.to_string())),
        };

        // Exchange code for tokens
        let token_resp: GoogleTokenResp = match client
            .post("https://oauth2.googleapis.com/token")
            .form(&[
                ("client_id", client_id.as_str()),
                ("client_secret", client_secret.as_str()),
                ("code", code_val.as_str()),
                ("redirect_uri", redirect_uri.as_str()),
                ("grant_type", "authorization_code"),
            ])
            .send()
            .await
        {
            Ok(r) => match r.json().await {
                Ok(v) => v,
                Err(e) => return CallbackResponse::BadGateway(Json(e.to_string())),
            },
            Err(e) => return CallbackResponse::BadGateway(Json(e.to_string())),
        };

        if let Some(err) = token_resp.error {
            return CallbackResponse::BadRequest(Json(format!("Google token error: {}", err)));
        }
        let access_token = match token_resp.access_token {
            Some(t) => t,
            None => return CallbackResponse::BadGateway(Json("No access_token in Google response".to_string())),
        };

        // Fetch user info from userinfo endpoint
        let user_info: GoogleUserInfo = match client
            .get("https://www.googleapis.com/oauth2/v3/userinfo")
            .bearer_auth(&access_token)
            .send()
            .await
        {
            Ok(r) => match r.json().await {
                Ok(v) => v,
                Err(e) => return CallbackResponse::BadGateway(Json(e.to_string())),
            },
            Err(e) => return CallbackResponse::BadGateway(Json(e.to_string())),
        };

        let name = user_info.name.clone().unwrap_or_else(|| user_info.sub.clone());
        let user_id = match find_or_create_oauth_user(
            &state.sql_pool,
            "google",
            &user_info.sub,
            &name,
            user_info.email.as_deref(),
        )
        .await
        {
            Ok(id) => id,
            Err(e) => return CallbackResponse::InternalError(Json(e.to_string())),
        };

        let token = match create_token(&user_id) {
            Ok(t) => t,
            Err(e) => return CallbackResponse::InternalError(Json(e.to_string())),
        };

        CallbackResponse::Ok(Json(OAuthTokenResponse { token, user_id, name }))
    }
}
