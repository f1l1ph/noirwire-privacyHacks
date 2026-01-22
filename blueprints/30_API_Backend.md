# 30 — API Backend & Indexer

## Overview

This blueprint defines the **API Backend layer** - a REST API gateway, transaction indexer, and webhook system that provides a developer-friendly interface to the NoirWire private payment system.

The API Backend serves as:
- **Gateway to PER**: Proxies requests to the PER execution layer
- **Transaction Indexer**: Reads and stores Solana events for historical queries
- **Webhook System**: Notifies users of transaction confirmations and settlements
- **Analytics Engine**: Aggregates pool statistics and metrics

> **Reference:** Integrates with [20_PER_Execution_Layer.md](20_PER_Execution_Layer.md) and [10_Solana_Programs.md](10_Solana_Programs.md)
>
> **Deployment:** Railway (API + Redis) + Supabase Cloud (PostgreSQL + Realtime)

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Tech Stack](#2-tech-stack)
3. [Database Design (Supabase)](#3-database-design-supabase)
4. [API Server Implementation](#4-api-server-implementation)
5. [Transaction Indexer](#5-transaction-indexer)
6. [Webhook System](#6-webhook-system)
7. [Caching Strategy (Redis)](#7-caching-strategy-redis)
8. [Real-time Updates (Supabase)](#8-real-time-updates-supabase)
9. [Railway Deployment](#9-railway-deployment)
10. [Authentication & Security](#10-authentication--security)
11. [Monitoring & Metrics](#11-monitoring--metrics)
12. [Testing Strategy](#12-testing-strategy)

---

## 1. Architecture Overview

### System Context

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT APPLICATIONS                      │
│   Web App • Mobile App • CLI • Third-party Integrations         │
└────────────────────────┬────────────────────────────────────────┘
                         │ HTTPS
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    RAILWAY DEPLOYMENT                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │             API BACKEND (Service 1)                     │   │
│  │  • REST API endpoints                                   │   │
│  │  • WebSocket subscriptions                              │   │
│  │  • PER proxy (deposit, transfer, withdraw)              │   │
│  │  • Rate limiting & auth                                 │   │
│  │  Port: 8080 (auto-assigned)                             │   │
│  └────────┬────────────────────────────────────────────────┘   │
│           │                                                     │
│           │                                                     │
│  ┌────────▼────────────────────────────────────────────────┐   │
│  │        TRANSACTION INDEXER (Service 2)                  │   │
│  │  • Listens to Solana events                             │   │
│  │  • Parses program logs                                  │   │
│  │  • Writes to Supabase                                   │   │
│  │  • Background worker (no exposed ports)                 │   │
│  └────────┬────────────────────────────────────────────────┘   │
│           │                                                     │
│           │                                                     │
│  ┌────────▼────────────────────────────────────────────────┐   │
│  │            REDIS CACHE (Railway Plugin)                 │   │
│  │  • Pool state cache                                     │   │
│  │  • Rate limiting buckets                                │   │
│  │  • Session storage                                      │   │
│  │  URL: redis://redis.railway.internal:6379               │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└──────────────────┬──────────────────────────────────────────────┘
                   │
                   ▼
        ┌──────────────────────────┐           ┌──────────────────┐
        │   SUPABASE CLOUD         │           │   PER EXECUTOR   │
        ├──────────────────────────┤           │  (Intel TDX TEE) │
        │  • PostgreSQL Database   │◄──────────│                  │
        │  • Realtime subscriptions│           │  • Proof gen     │
        │  • Auth (optional)       │           │  • State mgmt    │
        │  • REST API              │           └──────────────────┘
        └──────────────────────────┘
                   │
                   ▼
        ┌──────────────────────────┐
        │     SOLANA L1            │
        │  • Shielded Pool Program │
        │  • Event emissions       │
        └──────────────────────────┘
```

### Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    TRANSACTION FLOW                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  [1] User sends transfer request                               │
│      │                                                          │
│      ▼                                                          │
│  [2] API validates & forwards to PER                           │
│      │                                                          │
│      ▼                                                          │
│  [3] PER generates proof & updates state                       │
│      │                                                          │
│      ▼                                                          │
│  [4] PER returns receipt (nullifier, new_root)                 │
│      │                                                          │
│      ▼                                                          │
│  [5] API caches result & returns to user                       │
│      │                                                          │
│      ▼                                                          │
│  [6] Background: PER settles batch to Solana L1                │
│      │                                                          │
│      ▼                                                          │
│  [7] Indexer catches Solana event                              │
│      │                                                          │
│      ▼                                                          │
│  [8] Indexer writes to Supabase                                │
│      │                                                          │
│      ▼                                                          │
│  [9] Supabase Realtime notifies subscribed clients             │
│      │                                                          │
│      ▼                                                          │
│  [10] Webhook system triggers user callbacks                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Tech Stack

### Dependencies

```toml
# Cargo.toml

[package]
name = "noirwire_api_backend"
version = "0.1.0"
edition = "2021"

[dependencies]
# Web framework
tokio = { version = "1.35", features = ["full"] }
axum = { version = "0.7", features = ["ws"] }
tower = "0.4"
tower-http = { version = "0.5", features = ["cors", "trace", "compression-gzip"] }

# Supabase / PostgreSQL
postgrest = "2.0"  # Supabase REST API client
sqlx = { version = "0.7", features = ["postgres", "runtime-tokio", "uuid", "chrono"] }

# Redis (Railway plugin)
redis = { version = "0.24", features = ["tokio-comp", "connection-manager"] }

# Solana client
solana-client = "2.0"
solana-sdk = "2.0"
solana-transaction-status = "2.0"
anchor-client = "0.32.1"

# WebSocket for Realtime
tokio-tungstenite = "0.21"
futures-util = "0.3"

# Background jobs
tokio-cron-scheduler = "0.10"

# HTTP client (for PER + webhooks)
reqwest = { version = "0.11", features = ["json"] }

# Auth & security
jsonwebtoken = "9.2"
hmac = "0.12"
sha2 = "0.10"
argon2 = "0.5"

# Environment config
dotenvy = "0.15"

# Serialization
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"

# UUID
uuid = { version = "1.6", features = ["v4", "serde"] }

# Time
chrono = { version = "0.4", features = ["serde"] }

# Error handling
anyhow = "1.0"
thiserror = "1.0"

# Logging
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter", "json"] }

# Metrics
prometheus = "0.13"
axum-prometheus = "0.6"

[dev-dependencies]
httpmock = "0.7"
tokio-test = "0.4"

[[bin]]
name = "api-server"
path = "src/bin/api.rs"

[[bin]]
name = "indexer"
path = "src/bin/indexer.rs"

[profile.release]
opt-level = 3
lto = true
codegen-units = 1
```

### Project Structure

```
api_backend/
├── Cargo.toml
├── Dockerfile
├── railway.toml
├── .env.example
│
├── src/
│   ├── lib.rs
│   │
│   ├── bin/
│   │   ├── api.rs                   # API server entry point
│   │   └── indexer.rs               # Indexer worker entry point
│   │
│   ├── api/
│   │   ├── mod.rs
│   │   ├── routes.rs                # Route definitions
│   │   ├── handlers/
│   │   │   ├── mod.rs
│   │   │   ├── deposit.rs           # POST /deposit
│   │   │   ├── transfer.rs          # POST /transfer
│   │   │   ├── withdraw.rs          # POST /withdraw
│   │   │   ├── pool.rs              # GET /pool/info, /stats
│   │   │   ├── transactions.rs      # GET /transactions
│   │   │   └── webhooks.rs          # Webhook management
│   │   └── middleware/
│   │       ├── mod.rs
│   │       ├── auth.rs              # JWT validation
│   │       ├── rate_limit.rs        # Redis-based rate limiting
│   │       └── cors.rs
│   │
│   ├── db/
│   │   ├── mod.rs
│   │   ├── supabase.rs              # Supabase client
│   │   ├── models.rs                # Database models
│   │   └── queries.rs               # SQL queries
│   │
│   ├── indexer/
│   │   ├── mod.rs
│   │   ├── event_listener.rs        # Solana event polling
│   │   ├── parser.rs                # Parse program logs
│   │   └── writer.rs                # Write to Supabase
│   │
│   ├── webhooks/
│   │   ├── mod.rs
│   │   ├── dispatcher.rs            # Send webhook events
│   │   └── queue.rs                 # Retry queue
│   │
│   ├── cache/
│   │   ├── mod.rs
│   │   └── redis_client.rs          # Redis wrapper
│   │
│   ├── per/
│   │   ├── mod.rs
│   │   └── client.rs                # PER RPC client
│   │
│   └── utils/
│       ├── mod.rs
│       ├── config.rs                # Environment config
│       └── metrics.rs               # Prometheus metrics
│
├── migrations/                       # Supabase migrations
│   └── 001_initial_schema.sql
│
└── tests/
    ├── integration_test.rs
    └── api_test.rs
```

---

## 3. Database Design (Supabase)

### Schema Migration

```sql
-- migrations/001_initial_schema.sql
-- Run this in Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- DEPOSITS TABLE
-- =====================================================
CREATE TABLE deposits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    commitment BYTEA NOT NULL,
    amount BIGINT NOT NULL,
    new_root BYTEA NOT NULL,
    tx_signature TEXT NOT NULL,
    block_time TIMESTAMPTZ NOT NULL,
    slot BIGINT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT deposits_commitment_unique UNIQUE (commitment),
    CONSTRAINT deposits_signature_unique UNIQUE (tx_signature),
    CONSTRAINT deposits_amount_positive CHECK (amount > 0)
);

CREATE INDEX idx_deposits_block_time ON deposits(block_time DESC);
CREATE INDEX idx_deposits_signature ON deposits(tx_signature);
CREATE INDEX idx_deposits_commitment ON deposits(commitment);
CREATE INDEX idx_deposits_created_at ON deposits(created_at DESC);

COMMENT ON TABLE deposits IS 'Shielding transactions (public → private)';

-- =====================================================
-- WITHDRAWALS TABLE
-- =====================================================
CREATE TABLE withdrawals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nullifier BYTEA NOT NULL,
    amount BIGINT NOT NULL,
    recipient TEXT NOT NULL,
    new_root BYTEA NOT NULL,
    tx_signature TEXT NOT NULL,
    block_time TIMESTAMPTZ NOT NULL,
    slot BIGINT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT withdrawals_nullifier_unique UNIQUE (nullifier),
    CONSTRAINT withdrawals_signature_unique UNIQUE (tx_signature),
    CONSTRAINT withdrawals_amount_positive CHECK (amount > 0)
);

CREATE INDEX idx_withdrawals_block_time ON withdrawals(block_time DESC);
CREATE INDEX idx_withdrawals_nullifier ON withdrawals(nullifier);
CREATE INDEX idx_withdrawals_recipient ON withdrawals(recipient);
CREATE INDEX idx_withdrawals_created_at ON withdrawals(created_at DESC);

COMMENT ON TABLE withdrawals IS 'Unshielding transactions (private → public)';

-- =====================================================
-- BATCH SETTLEMENTS TABLE
-- =====================================================
CREATE TABLE batch_settlements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    old_root BYTEA NOT NULL,
    new_root BYTEA NOT NULL,
    nullifier_count INT NOT NULL,
    tx_signature TEXT NOT NULL,
    block_time TIMESTAMPTZ NOT NULL,
    slot BIGINT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT batch_signature_unique UNIQUE (tx_signature),
    CONSTRAINT batch_nullifier_count_positive CHECK (nullifier_count > 0)
);

CREATE INDEX idx_batch_settlements_block_time ON batch_settlements(block_time DESC);
CREATE INDEX idx_batch_settlements_new_root ON batch_settlements(new_root);

COMMENT ON TABLE batch_settlements IS 'PER batch settlements to L1';

-- =====================================================
-- WEBHOOK SUBSCRIPTIONS TABLE
-- =====================================================
CREATE TABLE webhook_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id TEXT NOT NULL,
    endpoint_url TEXT NOT NULL,
    secret_key TEXT NOT NULL,
    events TEXT[] NOT NULL,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_triggered_at TIMESTAMPTZ,
    total_deliveries INT DEFAULT 0,
    failed_deliveries INT DEFAULT 0,

    CONSTRAINT valid_url CHECK (endpoint_url ~* '^https?://.+'),
    CONSTRAINT valid_events CHECK (array_length(events, 1) > 0)
);

CREATE INDEX idx_webhook_user ON webhook_subscriptions(user_id);
CREATE INDEX idx_webhook_active ON webhook_subscriptions(active) WHERE active = true;

COMMENT ON TABLE webhook_subscriptions IS 'User webhook configurations';

-- =====================================================
-- WEBHOOK DELIVERIES (for debugging)
-- =====================================================
CREATE TABLE webhook_deliveries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    subscription_id UUID NOT NULL REFERENCES webhook_subscriptions(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    response_status INT,
    response_body TEXT,
    delivered_at TIMESTAMPTZ,
    failed BOOLEAN DEFAULT false,
    retry_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_webhook_deliveries_subscription ON webhook_deliveries(subscription_id);
CREATE INDEX idx_webhook_deliveries_created ON webhook_deliveries(created_at DESC);
CREATE INDEX idx_webhook_deliveries_failed ON webhook_deliveries(failed) WHERE failed = true;

-- =====================================================
-- POOL STATISTICS (Materialized View)
-- =====================================================
CREATE MATERIALIZED VIEW pool_stats AS
SELECT
    (SELECT COUNT(*) FROM deposits) as total_deposits_count,
    (SELECT COUNT(*) FROM withdrawals) as total_withdrawals_count,
    (SELECT COUNT(*) FROM batch_settlements) as total_batches_count,
    (SELECT COALESCE(SUM(amount), 0) FROM deposits) as total_deposited,
    (SELECT COALESCE(SUM(amount), 0) FROM withdrawals) as total_withdrawn,
    (SELECT COALESCE(SUM(amount), 0) FROM deposits) -
        (SELECT COALESCE(SUM(amount), 0) FROM withdrawals) as current_tvl,
    NOW() as last_updated;

CREATE UNIQUE INDEX ON pool_stats (last_updated);

COMMENT ON MATERIALIZED VIEW pool_stats IS 'Pool statistics (refresh via cron)';

-- Function to refresh stats
CREATE OR REPLACE FUNCTION refresh_pool_stats()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY pool_stats;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- ENABLE SUPABASE REALTIME
-- =====================================================
ALTER PUBLICATION supabase_realtime ADD TABLE deposits;
ALTER PUBLICATION supabase_realtime ADD TABLE withdrawals;
ALTER PUBLICATION supabase_realtime ADD TABLE batch_settlements;

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================
ALTER TABLE deposits ENABLE ROW LEVEL SECURITY;
ALTER TABLE withdrawals ENABLE ROW LEVEL SECURITY;
ALTER TABLE batch_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_subscriptions ENABLE ROW LEVEL SECURITY;

-- Public read access for transactions
CREATE POLICY "Public read deposits" ON deposits
    FOR SELECT USING (true);

CREATE POLICY "Public read withdrawals" ON withdrawals
    FOR SELECT USING (true);

CREATE POLICY "Public read batches" ON batch_settlements
    FOR SELECT USING (true);

-- Authenticated users manage own webhooks
CREATE POLICY "Users manage own webhooks" ON webhook_subscriptions
    FOR ALL USING (auth.uid()::text = user_id);

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Get recent transactions (deposits + withdrawals combined)
CREATE OR REPLACE FUNCTION get_recent_transactions(
    p_limit INT DEFAULT 50,
    p_offset INT DEFAULT 0
)
RETURNS TABLE (
    id UUID,
    tx_type TEXT,
    amount BIGINT,
    tx_signature TEXT,
    block_time TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    (
        SELECT
            d.id,
            'deposit'::TEXT as tx_type,
            d.amount,
            d.tx_signature,
            d.block_time
        FROM deposits d

        UNION ALL

        SELECT
            w.id,
            'withdrawal'::TEXT as tx_type,
            w.amount,
            w.tx_signature,
            w.block_time
        FROM withdrawals w
    )
    ORDER BY block_time DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

-- Get volume statistics for a time period
CREATE OR REPLACE FUNCTION get_volume_stats(
    p_period INTERVAL DEFAULT '24 hours'
)
RETURNS TABLE (
    deposit_volume BIGINT,
    withdrawal_volume BIGINT,
    deposit_count BIGINT,
    withdrawal_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COALESCE(SUM(d.amount), 0)::BIGINT as deposit_volume,
        COALESCE(SUM(w.amount), 0)::BIGINT as withdrawal_volume,
        COUNT(d.id)::BIGINT as deposit_count,
        COUNT(w.id)::BIGINT as withdrawal_count
    FROM deposits d
    FULL OUTER JOIN withdrawals w ON false
    WHERE
        d.block_time >= NOW() - p_period OR
        w.block_time >= NOW() - p_period;
END;
$$ LANGUAGE plpgsql;
```

### Database Models

```rust
// src/db/models.rs

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Deposit {
    pub id: Uuid,
    pub commitment: Vec<u8>,
    pub amount: i64,
    pub new_root: Vec<u8>,
    pub tx_signature: String,
    pub block_time: DateTime<Utc>,
    pub slot: i64,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Withdrawal {
    pub id: Uuid,
    pub nullifier: Vec<u8>,
    pub amount: i64,
    pub recipient: String,
    pub new_root: Vec<u8>,
    pub tx_signature: String,
    pub block_time: DateTime<Utc>,
    pub slot: i64,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct BatchSettlement {
    pub id: Uuid,
    pub old_root: Vec<u8>,
    pub new_root: Vec<u8>,
    pub nullifier_count: i32,
    pub tx_signature: String,
    pub block_time: DateTime<Utc>,
    pub slot: i64,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct WebhookSubscription {
    pub id: Uuid,
    pub user_id: String,
    pub endpoint_url: String,
    pub secret_key: String,
    pub events: Vec<String>,
    pub active: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub last_triggered_at: Option<DateTime<Utc>>,
    pub total_deliveries: i32,
    pub failed_deliveries: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct PoolStats {
    pub total_deposits_count: i64,
    pub total_withdrawals_count: i64,
    pub total_batches_count: i64,
    pub total_deposited: i64,
    pub total_withdrawn: i64,
    pub current_tvl: i64,
    pub last_updated: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Transaction {
    pub id: Uuid,
    pub tx_type: String,
    pub amount: i64,
    pub tx_signature: String,
    pub block_time: DateTime<Utc>,
}
```

---

## 4. API Server Implementation

### Main Server

```rust
// src/bin/api.rs

use noirwire_api_backend::{
    api::routes::create_router,
    db::supabase::SupabaseClient,
    cache::redis_client::RedisClient,
    per::client::PerClient,
    utils::config::Config,
};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Load environment
    dotenvy::dotenv().ok();

    // Initialize tracing
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "noirwire_api_backend=info,tower_http=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer().json())
        .init();

    tracing::info!("Starting NoirWire API Backend");

    // Load config
    let config = Config::from_env()?;

    // Initialize database client (Supabase)
    let db = SupabaseClient::new(&config.supabase_url, &config.supabase_service_key).await?;

    // Initialize Redis cache
    let cache = RedisClient::new(&config.redis_url).await?;

    // Initialize PER client
    let per_client = PerClient::new(&config.per_rpc_url);

    // Create router
    let app = create_router(db, cache, per_client);

    // Get port from Railway (or default)
    let port = std::env::var("PORT")
        .unwrap_or_else(|_| "8080".to_string())
        .parse::<u16>()?;

    let addr = format!("0.0.0.0:{}", port);
    tracing::info!("API server listening on {}", addr);

    // Start server
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
```

### Routes

```rust
// src/api/routes.rs

use axum::{
    routing::{get, post},
    Router,
};
use tower_http::{
    cors::CorsLayer,
    trace::TraceLayer,
    compression::CompressionLayer,
};
use std::sync::Arc;

use crate::{
    api::handlers::{deposit, transfer, withdraw, pool, transactions, webhooks},
    db::supabase::SupabaseClient,
    cache::redis_client::RedisClient,
    per::client::PerClient,
};

#[derive(Clone)]
pub struct AppState {
    pub db: Arc<SupabaseClient>,
    pub cache: Arc<RedisClient>,
    pub per_client: Arc<PerClient>,
}

pub fn create_router(
    db: SupabaseClient,
    cache: RedisClient,
    per_client: PerClient,
) -> Router {
    let state = AppState {
        db: Arc::new(db),
        cache: Arc::new(cache),
        per_client: Arc::new(per_client),
    };

    Router::new()
        // Health check
        .route("/health", get(health_check))

        // Transaction endpoints (proxy to PER)
        .route("/api/v1/deposit", post(deposit::handler))
        .route("/api/v1/transfer", post(transfer::handler))
        .route("/api/v1/withdraw", post(withdraw::handler))

        // Pool info (from indexer DB + cache)
        .route("/api/v1/pool/info", get(pool::info))
        .route("/api/v1/pool/stats", get(pool::stats))

        // Transaction history (from indexer DB)
        .route("/api/v1/transactions", get(transactions::list))
        .route("/api/v1/transactions/:signature", get(transactions::get))

        // Webhook management
        .route("/api/v1/webhooks", post(webhooks::create))
        .route("/api/v1/webhooks", get(webhooks::list))
        .route("/api/v1/webhooks/:id", get(webhooks::get))
        .route("/api/v1/webhooks/:id", axum::routing::delete(webhooks::delete))

        // Metrics
        .route("/metrics", get(metrics_handler))

        // Middleware
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
        .layer(CompressionLayer::new())

        .with_state(state)
}

async fn health_check() -> &'static str {
    "OK"
}

async fn metrics_handler() -> String {
    // TODO: Implement Prometheus metrics
    "# HELP noirwire_api_requests_total Total API requests\n".to_string()
}
```

### Transfer Handler Example

```rust
// src/api/handlers/transfer.rs

use axum::{
    extract::State,
    Json,
    http::StatusCode,
};
use serde::{Deserialize, Serialize};

use crate::api::routes::AppState;

#[derive(Debug, Deserialize)]
pub struct TransferRequest {
    // Private inputs
    pub sender_secret: String,      // hex encoded
    pub sender_amount: u64,
    pub sender_salt: String,
    pub sender_vault_id: String,
    pub transfer_amount: u64,
    pub nonce: String,
    pub receiver_pubkey: String,
    pub receiver_salt: String,
    pub receiver_vault_id: String,
    pub new_sender_salt: String,
}

#[derive(Debug, Serialize)]
pub struct TransferResponse {
    pub success: bool,
    pub nullifier: String,
    pub new_root: String,
    pub receipt_id: String,
}

pub async fn handler(
    State(state): State<AppState>,
    Json(request): Json<TransferRequest>,
) -> Result<Json<TransferResponse>, (StatusCode, String)> {
    tracing::info!("Received transfer request");

    // 1. Validate request
    if request.transfer_amount == 0 {
        return Err((
            StatusCode::BAD_REQUEST,
            "Transfer amount must be greater than 0".to_string(),
        ));
    }

    // 2. Forward to PER
    let response = state.per_client
        .transfer(request)
        .await
        .map_err(|e| {
            tracing::error!("PER transfer failed: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
        })?;

    // 3. Cache the result (optional, for quick lookups)
    let cache_key = format!("receipt:{}", response.receipt_id);
    let _ = state.cache
        .set(&cache_key, &serde_json::to_string(&response).unwrap(), 3600)
        .await;

    tracing::info!("Transfer successful: {}", response.nullifier);

    Ok(Json(response))
}
```

---

## 5. Transaction Indexer

### Event Listener

```rust
// src/bin/indexer.rs

use noirwire_api_backend::{
    indexer::event_listener::SolanaEventListener,
    db::supabase::SupabaseClient,
    utils::config::Config,
};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();

    tracing_subscriber::fmt()
        .with_env_filter("noirwire_api_backend=info")
        .json()
        .init();

    tracing::info!("Starting NoirWire Transaction Indexer");

    let config = Config::from_env()?;

    // Initialize Supabase client
    let db = SupabaseClient::new(&config.supabase_url, &config.supabase_service_key).await?;

    // Initialize Solana event listener
    let listener = SolanaEventListener::new(
        &config.solana_rpc_url,
        &config.pool_program_id,
        db.clone(),
    );

    // Start listening for events
    listener.run().await?;

    Ok(())
}
```

```rust
// src/indexer/event_listener.rs

use solana_client::{rpc_client::RpcClient, rpc_config::RpcTransactionConfig};
use solana_sdk::{commitment_config::CommitmentConfig, pubkey::Pubkey, signature::Signature};
use solana_transaction_status::UiTransactionEncoding;
use std::str::FromStr;
use std::time::Duration;

use crate::{
    db::supabase::SupabaseClient,
    indexer::parser::EventParser,
};

pub struct SolanaEventListener {
    rpc_client: RpcClient,
    pool_program_id: Pubkey,
    db: SupabaseClient,
    parser: EventParser,
}

impl SolanaEventListener {
    pub fn new(rpc_url: &str, pool_program_id: &str, db: SupabaseClient) -> Self {
        let rpc_client = RpcClient::new_with_commitment(
            rpc_url.to_string(),
            CommitmentConfig::confirmed(),
        );

        let pool_program_id = Pubkey::from_str(pool_program_id)
            .expect("Valid pool program ID");

        Self {
            rpc_client,
            pool_program_id,
            db,
            parser: EventParser::new(),
        }
    }

    pub async fn run(&self) -> anyhow::Result<()> {
        let mut last_signature: Option<Signature> = None;

        loop {
            match self.poll_transactions(last_signature).await {
                Ok(new_last_sig) => {
                    if new_last_sig.is_some() {
                        last_signature = new_last_sig;
                    }
                }
                Err(e) => {
                    tracing::error!("Error polling transactions: {}", e);
                }
            }

            // Poll every 2 seconds
            tokio::time::sleep(Duration::from_secs(2)).await;
        }
    }

    async fn poll_transactions(
        &self,
        before_signature: Option<Signature>,
    ) -> anyhow::Result<Option<Signature>> {
        // Get recent signatures for program
        let signatures = self.rpc_client.get_signatures_for_address_with_config(
            &self.pool_program_id,
            solana_client::rpc_config::RpcGetSignaturesForAddressConfig {
                before: before_signature,
                until: None,
                limit: Some(10),
                commitment: Some(CommitmentConfig::confirmed()),
            },
        )?;

        if signatures.is_empty() {
            return Ok(None);
        }

        let latest_signature = signatures[0].signature.parse::<Signature>()?;

        // Process each transaction
        for sig_info in &signatures {
            let signature = sig_info.signature.parse::<Signature>()?;

            if let Err(e) = self.process_transaction(&signature).await {
                tracing::error!("Failed to process transaction {}: {}", signature, e);
            }
        }

        Ok(Some(latest_signature))
    }

    async fn process_transaction(&self, signature: &Signature) -> anyhow::Result<()> {
        // Fetch transaction details
        let tx = self.rpc_client.get_transaction_with_config(
            signature,
            RpcTransactionConfig {
                encoding: Some(UiTransactionEncoding::Json),
                commitment: Some(CommitmentConfig::confirmed()),
                max_supported_transaction_version: Some(0),
            },
        )?;

        // Parse events from transaction logs
        if let Some(meta) = &tx.transaction.meta {
            if let Some(log_messages) = &meta.log_messages {
                let events = self.parser.parse_logs(log_messages)?;

                // Write events to database
                for event in events {
                    self.write_event_to_db(&event, signature, &tx).await?;
                }
            }
        }

        Ok(())
    }

    async fn write_event_to_db(
        &self,
        event: &ParsedEvent,
        signature: &Signature,
        tx: &solana_client::rpc_response::RpcConfirmedTransaction,
    ) -> anyhow::Result<()> {
        let block_time = tx.block_time.unwrap_or(0);
        let slot = tx.slot;

        match event {
            ParsedEvent::Deposit { commitment, amount, new_root } => {
                self.db.insert_deposit(
                    commitment,
                    *amount,
                    new_root,
                    &signature.to_string(),
                    block_time,
                    slot,
                ).await?;
            }
            ParsedEvent::Withdrawal { nullifier, amount, recipient, new_root } => {
                self.db.insert_withdrawal(
                    nullifier,
                    *amount,
                    recipient,
                    new_root,
                    &signature.to_string(),
                    block_time,
                    slot,
                ).await?;
            }
            ParsedEvent::BatchSettlement { old_root, new_root, nullifier_count } => {
                self.db.insert_batch_settlement(
                    old_root,
                    new_root,
                    *nullifier_count,
                    &signature.to_string(),
                    block_time,
                    slot,
                ).await?;
            }
        }

        Ok(())
    }
}

#[derive(Debug)]
pub enum ParsedEvent {
    Deposit {
        commitment: Vec<u8>,
        amount: u64,
        new_root: Vec<u8>,
    },
    Withdrawal {
        nullifier: Vec<u8>,
        amount: u64,
        recipient: String,
        new_root: Vec<u8>,
    },
    BatchSettlement {
        old_root: Vec<u8>,
        new_root: Vec<u8>,
        nullifier_count: i32,
    },
}
```

---

## 6. Webhook System

```rust
// src/webhooks/dispatcher.rs

use reqwest::Client;
use hmac::{Hmac, Mac};
use sha2::Sha256;
use serde::{Serialize, Deserialize};

use crate::db::{supabase::SupabaseClient, models::WebhookSubscription};

type HmacSha256 = Hmac<Sha256>;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebhookPayload {
    pub event_type: String,
    pub timestamp: i64,
    pub data: serde_json::Value,
}

pub struct WebhookDispatcher {
    http_client: Client,
    db: SupabaseClient,
}

impl WebhookDispatcher {
    pub fn new(db: SupabaseClient) -> Self {
        Self {
            http_client: Client::new(),
            db,
        }
    }

    pub async fn dispatch_event(
        &self,
        event_type: &str,
        data: serde_json::Value,
    ) -> anyhow::Result<()> {
        // Get all active subscriptions for this event
        let subscriptions = self.db
            .get_webhook_subscriptions_for_event(event_type)
            .await?;

        for subscription in subscriptions {
            if let Err(e) = self.send_webhook(&subscription, event_type, &data).await {
                tracing::error!(
                    "Failed to send webhook to {}: {}",
                    subscription.endpoint_url,
                    e
                );

                // Record failure
                self.db.record_webhook_failure(&subscription.id).await?;
            } else {
                // Record success
                self.db.record_webhook_success(&subscription.id).await?;
            }
        }

        Ok(())
    }

    async fn send_webhook(
        &self,
        subscription: &WebhookSubscription,
        event_type: &str,
        data: &serde_json::Value,
    ) -> anyhow::Result<()> {
        let payload = WebhookPayload {
            event_type: event_type.to_string(),
            timestamp: chrono::Utc::now().timestamp(),
            data: data.clone(),
        };

        let payload_json = serde_json::to_string(&payload)?;

        // Generate HMAC signature
        let signature = self.generate_signature(&payload_json, &subscription.secret_key)?;

        // Send HTTP POST request
        let response = self.http_client
            .post(&subscription.endpoint_url)
            .header("Content-Type", "application/json")
            .header("X-NoirWire-Signature", signature)
            .header("X-NoirWire-Event", event_type)
            .body(payload_json)
            .timeout(std::time::Duration::from_secs(10))
            .send()
            .await?;

        if !response.status().is_success() {
            anyhow::bail!(
                "Webhook endpoint returned non-success status: {}",
                response.status()
            );
        }

        Ok(())
    }

    fn generate_signature(&self, payload: &str, secret: &str) -> anyhow::Result<String> {
        let mut mac = HmacSha256::new_from_slice(secret.as_bytes())?;
        mac.update(payload.as_bytes());
        let result = mac.finalize();
        Ok(hex::encode(result.into_bytes()))
    }
}
```

---

## 7. Caching Strategy (Redis)

```rust
// src/cache/redis_client.rs

use redis::{aio::ConnectionManager, AsyncCommands};

pub struct RedisClient {
    conn: ConnectionManager,
}

impl RedisClient {
    pub async fn new(redis_url: &str) -> anyhow::Result<Self> {
        let client = redis::Client::open(redis_url)?;
        let conn = ConnectionManager::new(client).await?;

        Ok(Self { conn })
    }

    /// Set value with TTL (seconds)
    pub async fn set(&self, key: &str, value: &str, ttl: usize) -> anyhow::Result<()> {
        let mut conn = self.conn.clone();
        conn.set_ex(key, value, ttl).await?;
        Ok(())
    }

    /// Get value
    pub async fn get(&self, key: &str) -> anyhow::Result<Option<String>> {
        let mut conn = self.conn.clone();
        let value: Option<String> = conn.get(key).await?;
        Ok(value)
    }

    /// Delete key
    pub async fn delete(&self, key: &str) -> anyhow::Result<()> {
        let mut conn = self.conn.clone();
        conn.del(key).await?;
        Ok(())
    }

    /// Rate limiting: check if allowed
    pub async fn check_rate_limit(
        &self,
        key: &str,
        limit: usize,
        window_secs: usize,
    ) -> anyhow::Result<bool> {
        let mut conn = self.conn.clone();

        let count: usize = conn.incr(key, 1).await?;

        if count == 1 {
            // Set expiration on first request
            conn.expire(key, window_secs).await?;
        }

        Ok(count <= limit)
    }
}

impl Clone for RedisClient {
    fn clone(&self) -> Self {
        Self {
            conn: self.conn.clone(),
        }
    }
}
```

---

## 8. Real-time Updates (Supabase)

```rust
// src/db/supabase.rs

use postgrest::Postgrest;
use sqlx::PgPool;

pub struct SupabaseClient {
    rest_client: Postgrest,
    pool: PgPool,
}

impl SupabaseClient {
    pub async fn new(url: &str, service_key: &str) -> anyhow::Result<Self> {
        // REST client for simple queries
        let rest_client = Postgrest::new(url)
            .insert_header("apikey", service_key)
            .insert_header("Authorization", format!("Bearer {}", service_key));

        // Direct PostgreSQL pool for complex queries
        let database_url = format!("{}/db", url); // Supabase provides direct connection
        let pool = PgPool::connect(&database_url).await?;

        Ok(Self { rest_client, pool })
    }

    pub async fn insert_deposit(
        &self,
        commitment: &[u8],
        amount: u64,
        new_root: &[u8],
        tx_signature: &str,
        block_time: i64,
        slot: i64,
    ) -> anyhow::Result<()> {
        sqlx::query!(
            r#"
            INSERT INTO deposits (commitment, amount, new_root, tx_signature, block_time, slot)
            VALUES ($1, $2, $3, $4, to_timestamp($5), $6)
            "#,
            commitment,
            amount as i64,
            new_root,
            tx_signature,
            block_time,
            slot,
        )
        .execute(&self.pool)
        .await?;

        tracing::info!("Deposit indexed: {}", tx_signature);
        Ok(())
    }

    pub async fn get_pool_stats(&self) -> anyhow::Result<crate::db::models::PoolStats> {
        let stats = sqlx::query_as!(
            crate::db::models::PoolStats,
            "SELECT * FROM pool_stats"
        )
        .fetch_one(&self.pool)
        .await?;

        Ok(stats)
    }

    // More methods...
}

impl Clone for SupabaseClient {
    fn clone(&self) -> Self {
        Self {
            rest_client: self.rest_client.clone(),
            pool: self.pool.clone(),
        }
    }
}
```

---

## 9. Railway Deployment

### Railway Configuration

```toml
# railway.toml

[build]
builder = "dockerfile"
dockerfilePath = "Dockerfile"

[deploy]
healthcheckPath = "/health"
healthcheckTimeout = 100
restartPolicyType = "on-failure"
restartPolicyMaxRetries = 10

# API Server Service
[[services]]
name = "api-backend"
source = "."
startCommand = "cargo run --release --bin api-server"

[services.env]
# Auto-provided by Railway:
# - PORT
# - RAILWAY_ENVIRONMENT
# - RAILWAY_PUBLIC_DOMAIN

# Add these manually in Railway dashboard:
# - SUPABASE_URL
# - SUPABASE_ANON_KEY
# - SUPABASE_SERVICE_KEY
# - REDIS_URL (auto from plugin)
# - PER_RPC_URL
# - SOLANA_RPC_URL
# - POOL_PROGRAM_ID

# Indexer Worker Service
[[services]]
name = "indexer-worker"
source = "."
startCommand = "cargo run --release --bin indexer"

[services.env]
# Same env vars as API
```

### Dockerfile

```dockerfile
# Dockerfile

FROM rust:1.75 as builder

WORKDIR /app

# Copy manifests
COPY Cargo.toml Cargo.lock ./

# Build dependencies
RUN mkdir src && \
    echo "fn main() {}" > src/lib.rs && \
    mkdir -p src/bin && \
    echo "fn main() {}" > src/bin/api.rs && \
    echo "fn main() {}" > src/bin/indexer.rs

RUN cargo build --release
RUN rm -rf src

# Copy source
COPY src ./src
COPY migrations ./migrations

# Build application
RUN cargo build --release

# Runtime stage
FROM debian:bookworm-slim

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/api-server /usr/local/bin/
COPY --from=builder /app/target/release/indexer /usr/local/bin/

ENV RUST_LOG=info

# Default command (can be overridden by Railway)
CMD ["api-server"]
```

### Environment Variables

```bash
# .env.example

# Supabase
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_KEY=eyJhbGc...

# Redis (auto-provided by Railway Redis plugin)
REDIS_URL=redis://default:password@redis.railway.internal:6379

# PER Executor
PER_RPC_URL=http://per-executor:3000

# Solana
SOLANA_RPC_URL=https://api.devnet.solana.com

# Pool Program
POOL_PROGRAM_ID=NwirePoo1XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX

# Server (auto-provided by Railway)
PORT=8080
```

### Deployment Steps

```bash
# 1. Install Railway CLI
npm install -g @railway/cli

# 2. Login to Railway
railway login

# 3. Create new project (or link existing)
railway init

# 4. Add Redis plugin
railway add --plugin redis

# 5. Set environment variables
railway variables set SUPABASE_URL=https://xxxxx.supabase.co
railway variables set SUPABASE_ANON_KEY=eyJ...
railway variables set SUPABASE_SERVICE_KEY=eyJ...
railway variables set PER_RPC_URL=http://per-executor:3000
railway variables set SOLANA_RPC_URL=https://api.devnet.solana.com
railway variables set POOL_PROGRAM_ID=NwirePoo1XXX...

# 6. Deploy
git push origin main  # Auto-deploys via Railway GitHub integration

# Or manual deploy:
railway up

# 7. View logs
railway logs

# 8. Open in browser
railway open
```

---

## 10. Authentication & Security

### JWT Validation (Optional)

```rust
// src/api/middleware/auth.rs

use axum::{
    extract::Request,
    http::StatusCode,
    middleware::Next,
    response::Response,
};
use jsonwebtoken::{decode, DecodingKey, Validation};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,
    pub exp: usize,
}

pub async fn auth_middleware(
    mut req: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    let auth_header = req
        .headers()
        .get("Authorization")
        .and_then(|v| v.to_str().ok());

    let token = match auth_header {
        Some(header) if header.starts_with("Bearer ") => {
            &header[7..]
        }
        _ => return Err(StatusCode::UNAUTHORIZED),
    };

    // Validate JWT (using Supabase JWT secret)
    let jwt_secret = std::env::var("SUPABASE_JWT_SECRET")
        .expect("SUPABASE_JWT_SECRET must be set");

    let claims = decode::<Claims>(
        token,
        &DecodingKey::from_secret(jwt_secret.as_bytes()),
        &Validation::default(),
    )
    .map_err(|_| StatusCode::UNAUTHORIZED)?;

    // Add user ID to request extensions
    req.extensions_mut().insert(claims.claims.sub.clone());

    Ok(next.run(req).await)
}
```

### Rate Limiting

```rust
// src/api/middleware/rate_limit.rs

use axum::{
    extract::{Request, State},
    http::StatusCode,
    middleware::Next,
    response::Response,
};
use std::sync::Arc;

use crate::{cache::redis_client::RedisClient, api::routes::AppState};

pub async fn rate_limit_middleware(
    State(state): State<AppState>,
    req: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    // Get client IP
    let client_ip = req
        .headers()
        .get("X-Forwarded-For")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("unknown");

    // Rate limit key
    let rate_key = format!("rate_limit:{}", client_ip);

    // Check rate limit: 100 requests per minute
    let allowed = state.cache
        .check_rate_limit(&rate_key, 100, 60)
        .await
        .unwrap_or(false);

    if !allowed {
        return Err(StatusCode::TOO_MANY_REQUESTS);
    }

    Ok(next.run(req).await)
}
```

---

## 11. Monitoring & Metrics

### Prometheus Metrics

```rust
// src/utils/metrics.rs

use prometheus::{
    IntCounterVec, HistogramVec, Registry, Opts, HistogramOpts,
};
use lazy_static::lazy_static;

lazy_static! {
    pub static ref REGISTRY: Registry = Registry::new();

    pub static ref HTTP_REQUESTS_TOTAL: IntCounterVec = IntCounterVec::new(
        Opts::new("http_requests_total", "Total HTTP requests"),
        &["method", "endpoint", "status"]
    ).unwrap();

    pub static ref HTTP_REQUEST_DURATION: HistogramVec = HistogramVec::new(
        HistogramOpts::new("http_request_duration_seconds", "HTTP request duration"),
        &["method", "endpoint"]
    ).unwrap();

    pub static ref INDEXER_EVENTS_TOTAL: IntCounterVec = IntCounterVec::new(
        Opts::new("indexer_events_total", "Total events indexed"),
        &["event_type"]
    ).unwrap();
}

pub fn register_metrics() {
    REGISTRY.register(Box::new(HTTP_REQUESTS_TOTAL.clone())).unwrap();
    REGISTRY.register(Box::new(HTTP_REQUEST_DURATION.clone())).unwrap();
    REGISTRY.register(Box::new(INDEXER_EVENTS_TOTAL.clone())).unwrap();
}
```

---

## 12. Testing Strategy

```rust
// tests/api_test.rs

use noirwire_api_backend::api::routes::create_router;

#[tokio::test]
async fn test_health_check() {
    let app = create_router(/* mock dependencies */);

    let response = app
        .oneshot(
            axum::http::Request::builder()
                .uri("/health")
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), axum::http::StatusCode::OK);
}

#[tokio::test]
async fn test_deposit_endpoint() {
    // TODO: Test deposit flow
}
```

---

## Summary

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **API Server** | Axum | REST API gateway |
| **Database** | Supabase PostgreSQL | Transaction history |
| **Cache** | Railway Redis | Rate limiting, caching |
| **Indexer** | Tokio background worker | Event listener |
| **Webhooks** | Reqwest + HMAC | Event notifications |
| **Realtime** | Supabase Realtime | WebSocket subscriptions |
| **Deployment** | Railway | Hosting & scaling |

---

## References

- [Railway Documentation](https://docs.railway.app/)
- [Supabase Documentation](https://supabase.com/docs)
- [Axum Web Framework](https://docs.rs/axum/latest/axum/)
- [Solana RPC API](https://solana.com/docs/rpc)

---

_Blueprint Version: 1.0_
_Status: Ready for Implementation_
_Dependencies: Requires 20_PER_Execution_Layer.md, 10_Solana_Programs.md_
