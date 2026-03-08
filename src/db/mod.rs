use sqlx::sqlite::SqlitePool;
use sled::Db;
use tokio::sync::broadcast;
use anyhow::Result;
use crate::models::MessageEvent;

#[derive(Clone)]
pub struct AppState {
    pub sql_pool: SqlitePool,
    pub msg_db: Db,
    pub sender: broadcast::Sender<MessageEvent>,
}

pub async fn init_db(database_url: &str, msg_db_path: &str) -> Result<AppState> {
    println!("Initializing Database with URL: {} and MSG_DB_PATH: {}", database_url, msg_db_path);

    // Ensure Sled directory exists
    if !msg_db_path.is_empty() && msg_db_path != ":memory:" {
        std::fs::create_dir_all(msg_db_path)?;
    }

    // Attempt to extract directory from sqlite URL for directory creation
    if database_url.starts_with("sqlite://") && !database_url.contains(":memory:") {
        // Remove mode parameter if present
        let path_part = database_url[9..].split('?').next().unwrap_or("");
        if let Some(parent) = std::path::Path::new(path_part).parent() {
            std::fs::create_dir_all(parent)?;
        }
    }

    // Initialize SQLite with WAL mode for better concurrency
    let sql_pool = SqlitePool::connect(database_url).await
        .map_err(|e| anyhow::anyhow!("Failed to connect to SQLite {}: {}", database_url, e))?;

    // Enable WAL mode for better performance
    sqlx::query("PRAGMA journal_mode=WAL").execute(&sql_pool).await.ok();
    sqlx::query("PRAGMA foreign_keys=ON").execute(&sql_pool).await.ok();

    // Run initial schema migration (CREATE TABLE IF NOT EXISTS is safe to re-run)
    sqlx::query(include_str!("../../migrations/20240101000000_init.sql"))
        .execute(&sql_pool)
        .await
        .map_err(|e| anyhow::anyhow!("Failed to run migrations: {}", e))?;

    // Create table for system settings
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )"
    )
    .execute(&sql_pool)
    .await
    .map_err(|e| anyhow::anyhow!("Failed to create settings table: {}", e))?;

    // Insert default settings if they don't exist
    sqlx::query(
        "INSERT OR IGNORE INTO settings (key, value) VALUES ('allow_registration', 'true')"
    )
    .execute(&sql_pool)
    .await
    .map_err(|e| anyhow::anyhow!("Failed to insert default settings: {}", e))?;

    // Run additive migrations that add columns to existing tables
    // SQLite doesn't support ADD COLUMN IF NOT EXISTS, so we try each and ignore errors
    let additive_migrations: &[&str] = &[
        "ALTER TABLE users ADD COLUMN avatar TEXT",
        "ALTER TABLE users ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT 0",
        "ALTER TABLE users ADD COLUMN is_banned BOOLEAN NOT NULL DEFAULT 0",
        "ALTER TABLE users ADD COLUMN e2ee_initialized BOOLEAN NOT NULL DEFAULT 0",
        "ALTER TABLE channels ADD COLUMN announcement TEXT NOT NULL DEFAULT ''",
        "CREATE TABLE IF NOT EXISTS pinned_messages (
            id TEXT PRIMARY KEY NOT NULL,
            channel_id TEXT,
            pinned_by TEXT NOT NULL,
            content TEXT NOT NULL,
            pinned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )",
        "CREATE TABLE IF NOT EXISTS invite_links (
            code TEXT PRIMARY KEY NOT NULL,
            created_by TEXT NOT NULL,
            max_uses INTEGER NOT NULL DEFAULT -1,
            used_count INTEGER NOT NULL DEFAULT 0,
            expires_at DATETIME,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )",
        "CREATE TABLE IF NOT EXISTS webhooks (
            id TEXT PRIMARY KEY NOT NULL,
            name TEXT NOT NULL,
            channel_id TEXT NOT NULL,
            secret TEXT NOT NULL,
            created_by TEXT NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )",
    ];

    for stmt in additive_migrations {
        // Ignore "duplicate column" errors; the column already exists
        let _ = sqlx::query(stmt).execute(&sql_pool).await;
    }

    // Initialize Sled
    let msg_db = sled::open(msg_db_path)
        .map_err(|e| anyhow::anyhow!("Failed to open Sled at {}: {}", msg_db_path, e))?;

    // Initialize Broadcast Channel (Capacity 100)
    let (sender, _) = broadcast::channel(100);

    Ok(AppState {
        sql_pool,
        msg_db,
        sender,
    })
}
