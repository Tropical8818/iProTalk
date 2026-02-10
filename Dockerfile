FROM rust:1.85-slim-bookworm AS builder

WORKDIR /usr/src/app
COPY . .

# Install build dependencies
RUN apt-get update && apt-get install -y pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*

# Build the application
RUN cargo build --release

# Runtime stage
FROM debian:bookworm-slim

WORKDIR /app

# Install runtime dependencies (like libssl)
RUN apt-get update && apt-get install -y libssl3 ca-certificates curl && rm -rf /var/lib/apt/lists/*

# Copy the binary from the builder
COPY --from=builder /usr/src/app/target/release/ipro-talk /app/ipro-talk

# Create directories for persistence
RUN mkdir -p /app/data /app/msg_db

# Expose port
EXPOSE 3000

# Set environment variables
ENV DATABASE_URL=sqlite:///app/data/ipro-talk.db
ENV MSG_DB_PATH=/app/msg_db
ENV RUST_LOG=poem=info,ipro_talk=info

CMD ["/app/ipro-talk"]
