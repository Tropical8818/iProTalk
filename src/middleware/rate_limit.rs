use std::sync::Arc;

use dashmap::DashMap;
use poem::{Endpoint, IntoResponse, Middleware, Request, Response, Result};

// ── Route-group classification ────────────────────────────────────────────────

fn route_group(path: &str) -> &'static str {
    if path.starts_with("/api/auth/login") || path.starts_with("/api/auth/register") {
        "auth_strict"
    } else if path.starts_with("/api/auth/oauth2") {
        "oauth"
    } else if path.starts_with("/api/webhooks") && path.ends_with("/trigger") {
        "webhook_trigger"
    } else {
        "api_general"
    }
}

fn limits_for_group(group: &str) -> (u32, i64) {
    match group {
        "auth_strict" => (10, 60),
        "oauth" => (20, 60),
        "webhook_trigger" => (30, 60),
        _ => (200, 60),
    }
}

// ── Middleware wrapper types ──────────────────────────────────────────────────

/// A single composable middleware instance. Internally it holds one
/// `DashMap`-backed bucket store per (IP, route-group) pair; limits are
/// applied according to the route group.
#[derive(Clone)]
pub struct RateLimitMiddleware {
    /// key: "<ip>:<group>" → (count, window_start)
    buckets: Arc<DashMap<String, (u32, i64)>>,
}

impl RateLimitMiddleware {
    pub fn new() -> Self {
        Self {
            buckets: Arc::new(DashMap::new()),
        }
    }
}

impl Default for RateLimitMiddleware {
    fn default() -> Self {
        Self::new()
    }
}

impl<E: Endpoint> Middleware<E> for RateLimitMiddleware {
    type Output = RateLimitEndpoint<E>;

    fn transform(&self, ep: E) -> Self::Output {
        RateLimitEndpoint {
            inner: ep,
            buckets: Arc::clone(&self.buckets),
        }
    }
}

pub struct RateLimitEndpoint<E> {
    inner: E,
    buckets: Arc<DashMap<String, (u32, i64)>>,
}

impl<E: Endpoint> Endpoint for RateLimitEndpoint<E> {
    type Output = Response;

    async fn call(&self, req: Request) -> Result<Self::Output> {
        let path = req.uri().path().to_string();
        let group = route_group(&path);
        let (max_req, window) = limits_for_group(group);

        // Extract IP from X-Forwarded-For or remote addr
        let ip = req
            .header("x-forwarded-for")
            .and_then(|v: &str| v.split(',').next())
            .map(|s: &str| s.trim().to_string())
            .unwrap_or_else(|| "unknown".to_string());

        // For webhook trigger paths use the webhook id as key suffix instead of IP
        let key = if group == "webhook_trigger" {
            // path looks like /api/webhooks/<id>/trigger — extract the id safely
            let webhook_id = path
                .strip_prefix("/api/webhooks/")
                .and_then(|s| s.strip_suffix("/trigger"))
                .unwrap_or("unknown")
                .to_string();
            format!("{}:{}", webhook_id, group)
        } else {
            format!("{}:{}", ip, group)
        };

        let now = chrono::Utc::now().timestamp();
        let allowed = {
            let mut entry = self.buckets.entry(key.clone()).or_insert((0, now));
            let (count, window_start) = entry.value_mut();
            if now - *window_start >= window {
                *count = 0;
                *window_start = now;
            }
            if *count < max_req {
                *count += 1;
                true
            } else {
                false
            }
        };

        // Periodically evict stale entries to keep memory usage bounded.
        // We do this on roughly 1-in-1000 requests (cheap probabilistic cleanup).
        if now % 1000 == 0 {
            // longest window is 60 s; keep some headroom (3×)
            let max_age = 180i64;
            self.buckets.retain(|_, (_, window_start)| now - *window_start < max_age);
        }

        if !allowed {
            return Ok(Response::builder()
                .status(poem::http::StatusCode::TOO_MANY_REQUESTS)
                .header("Retry-After", window.to_string())
                .header("Content-Type", "application/json")
                .body(r#"{"error":"Too Many Requests"}"#)
                .into_response());
        }

        self.inner.call(req).await.map(IntoResponse::into_response)
    }
}
