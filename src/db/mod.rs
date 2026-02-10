use sqlx::sqlite::SqlitePool;
use sled::Db;
use std::sync::Arc;
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
    // Initialize SQLite
    let sql_pool = SqlitePool::connect(database_url).await?;
    
    // Run migrations
    sqlx::query(include_str!("../../migrations/20240101000000_init.sql"))
        .execute(&sql_pool)
        .await?;

    // Initialize Sled
    let msg_db = sled::open(msg_db_path)?;

    // Initialize Broadcast Channel (Capacity 100)
    let (sender, _) = broadcast::channel(100);

    Ok(AppState {
        sql_pool,
        msg_db,
        sender,
    })
}
