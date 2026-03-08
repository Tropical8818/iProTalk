FROM rust:1.85-slim-bookworm AS builder

WORKDIR /usr/src/app

# Cache dependencies first
COPY Cargo.toml Cargo.lock ./
RUN mkdir src && echo 'fn main(){}' > src/main.rs
RUN apt-get update && apt-get install -y pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*
RUN cargo build --release 2>/dev/null || true
RUN rm -rf src

# Copy actual source and build
COPY . .
RUN cargo build --release

# Runtime stage — minimal image
FROM debian:bookworm-slim

WORKDIR /app

# Install runtime deps + healthcheck tools
RUN apt-get update && \
    apt-get install -y --no-install-recommends libssl3 ca-certificates curl sqlite3 && \
    rm -rf /var/lib/apt/lists/* && \
    mkdir -p /app/data /app/msg_db /app/backups

# Copy binary + static assets
COPY --from=builder /usr/src/app/target/release/ipro-talk /app/ipro-talk
COPY --from=builder /usr/src/app/static /app/static
COPY --from=builder /usr/src/app/migrations /app/migrations

EXPOSE 3000

# Default env
ENV DATABASE_URL=sqlite:///app/data/iprotalk.db?mode=rwc
ENV MSG_DB_PATH=/app/msg_db
ENV RUST_LOG=poem=info,ipro_talk=info
ENV SECRET_KEY=change_me_in_production

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

CMD ["/app/ipro-talk"]
