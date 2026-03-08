use sqlx::sqlite::SqlitePool;
use sled::Db;
use tokio::sync::broadcast;
use anyhow::Result;
use std::sync::Arc;
use tokio::sync::RwLock;
use std::collections::HashMap;
use crate::models::RealtimeEvent;

#[derive(Clone)]
pub struct AppState {
    pub sql_pool: SqlitePool,
    pub msg_db: Db,
    /// Broadcast channel for all realtime events (messages, reactions, typing, presence)
    pub sender: broadcast::Sender<RealtimeEvent>,
    /// Tracks online users: user_id -> last heartbeat unix timestamp
    pub online_users: Arc<RwLock<HashMap<String, i64>>>,
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

    // Run OAuth migration (statements separated; ignore duplicate column/index errors)
    for stmt in include_str!("../../migrations/20260308000001_oauth.sql")
        .split(';')
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        let _ = sqlx::query(stmt).execute(&sql_pool).await;
    }

    // Run audit log migration
    for stmt in include_str!("../../migrations/20260308000002_audit_log.sql")
        .split(';')
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        let _ = sqlx::query(stmt).execute(&sql_pool).await;
    }

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
        "CREATE TABLE IF NOT EXISTS user_roles (
            user_id TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'member',
            channel_id TEXT,
            assigned_by TEXT,
            assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, role, channel_id)
        )",
        "ALTER TABLE users ADD COLUMN oauth_provider TEXT",
        "ALTER TABLE users ADD COLUMN oauth_provider_id TEXT",
        // Message reactions table
        "CREATE TABLE IF NOT EXISTS message_reactions (
            id TEXT PRIMARY KEY NOT NULL,
            message_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            emoji TEXT NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(message_id, user_id, emoji)
        )",
        // Message mentions table
        "CREATE TABLE IF NOT EXISTS message_mentions (
            message_id TEXT NOT NULL,
            mentioned_user_id TEXT NOT NULL,
            channel_id TEXT,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY(message_id, mentioned_user_id)
        )",
    ];

    for stmt in additive_migrations {
        // Ignore "duplicate column" / "already exists" errors — the object was
        // created on a previous startup. Log anything else for visibility.
        if let Err(e) = sqlx::query(stmt).execute(&sql_pool).await {
            let msg = e.to_string();
            if !msg.contains("duplicate column") && !msg.contains("already exists") {
                tracing::warn!("Additive migration skipped ({}): {}", &stmt[..stmt.len().min(60)], e);
            }
        }
    }

    // Initialize Sled
    let msg_db = sled::open(msg_db_path)
        .map_err(|e| anyhow::anyhow!("Failed to open Sled at {}: {}", msg_db_path, e))?;

    // Initialize Broadcast Channel (Capacity 256)
    let (sender, _) = broadcast::channel(256);

    Ok(AppState {
        sql_pool,
        msg_db,
        sender,
        online_users: Arc::new(RwLock::new(HashMap::new())),
    })
}
