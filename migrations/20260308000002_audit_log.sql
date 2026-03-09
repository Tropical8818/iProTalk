CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY NOT NULL,
    actor_id TEXT,
    actor_type TEXT NOT NULL DEFAULT 'user',
    action TEXT NOT NULL,
    target_type TEXT,
    target_id TEXT,
    metadata TEXT,
    ip_address TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action, created_at);
