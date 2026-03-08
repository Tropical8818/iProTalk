use poem::{listener::TcpListener, Route, Server, EndpointExt, handler, IntoResponse};
use poem::web::Json;
use std::env;
use tracing_subscriber;

mod api;
mod db;
mod models;
mod middleware;

use api::{
    auth::AuthApi, keys::KeysApi, messages::MessagesApi, users::UsersApi,
    contacts::ContactsApi, files::FilesApi, admin::AdminApi, channels::ChannelsApi,
    webhooks::WebhookApi, oauth::OAuthApi, audit::AuditApi, reactions::ReactionsApi, presence::PresenceApi,
};
use db::init_db;
use middleware::rate_limit::RateLimitMiddleware;

#[handler]
fn health_check() -> impl IntoResponse {
    Json(serde_json::json!({
        "status": "ok",
        "version": env!("CARGO_PKG_VERSION"),
        "uptime": "running"
    }))
}

#[tokio::main]
async fn main() -> Result<(), std::io::Error> {
    // Initialize logging
    if std::env::var_os("RUST_LOG").is_none() {
        std::env::set_var("RUST_LOG", "poem=debug");
    }
    tracing_subscriber::fmt::init();

    let database_url = env::var("DATABASE_URL").unwrap_or_else(|_| "sqlite::memory:".to_string());
    let msg_db_path = env::var("MSG_DB_PATH").unwrap_or_else(|_| "msg_db".to_string());
    let _secret_key = env::var("SECRET_KEY").expect("SECRET_KEY must be set for security");

    // Initialize Database
    let state = init_db(&database_url, &msg_db_path).await.expect("Failed to init DB");

    // create the API service
    let api_service = poem_openapi::OpenApiService::new(
        (AuthApi, KeysApi, MessagesApi, UsersApi, ContactsApi, FilesApi, AdminApi, ChannelsApi, WebhookApi, OAuthApi, AuditApi, ReactionsApi, PresenceApi),
        "iProTalk API",
        "0.1.0",
    )
    .server("http://localhost:3000/api");

    let ui = api_service.swagger_ui();
    let spec = api_service.spec_endpoint();

    let cors = poem::middleware::Cors::new()
        .allow_methods(vec!["GET", "POST", "PUT", "DELETE", "OPTIONS"])
        .allow_headers(vec!["Authorization", "Content-Type", "X-Webhook-Secret", "Accept"])
        .allow_credentials(true);

    let app = Route::new()
        .at("/", poem::endpoint::StaticFilesEndpoint::new("static").index_file("index.html"))
        .at("/api/health", poem::get(health_check))
        .at("/api/messages/events", poem::get(api::messages::sse_handler))
        .at("/api/users/:uid/avatar", poem::get(api::users::get_avatar))
        .at("/api/files/:id", poem::get(api::files::download_file))
        .nest("/api", api_service)
        .nest("/docs", ui)
        .nest("/spec", spec)
        .with(cors)
        .with(RateLimitMiddleware::new())
        .data(state);

    println!("Server starting at http://localhost:3000");
    Server::new(TcpListener::bind("0.0.0.0:3000"))
        .run(app)
        .await
}
