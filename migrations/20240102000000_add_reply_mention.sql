-- Add message_mentions table for indexing @mention relationships
CREATE TABLE IF NOT EXISTS message_mentions (
    message_id TEXT NOT NULL,
    mentioned_user_id TEXT NOT NULL,
    channel_id TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(message_id, mentioned_user_id)
);
