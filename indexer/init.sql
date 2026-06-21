-- Logos Node Explorer + Monitor — TimescaleDB Schema

-- ═══════════════════════════════════════════════════════════════
-- CONSENSUS SNAPSHOTS (polled every 10s)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS consensus_snapshots (
    ts              TIMESTAMPTZ     NOT NULL,
    block_height    BIGINT          NOT NULL,
    slot            BIGINT          NOT NULL,
    lib_slot        BIGINT          NOT NULL,
    lib_hash        TEXT            NOT NULL,
    tip_hash        TEXT            NOT NULL,
    mode            TEXT            NOT NULL
);
SELECT create_hypertable('consensus_snapshots', 'ts', if_not_exists => TRUE);

-- ═══════════════════════════════════════════════════════════════
-- BLOCKS (indexed from chain headers)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS blocks (
    ts              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    block_hash      TEXT            NOT NULL UNIQUE,
    height          BIGINT          NOT NULL,
    slot            BIGINT
);
SELECT create_hypertable('blocks', 'ts', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS idx_blocks_height ON blocks (height DESC);
CREATE INDEX IF NOT EXISTS idx_blocks_hash ON blocks (block_hash);

-- ═══════════════════════════════════════════════════════════════
-- BLOCK EVENTS (tracks when new blocks appear — for block time calc)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS block_events (
    ts              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    height          BIGINT          NOT NULL,
    tip_hash        TEXT            NOT NULL,
    block_time_ms   BIGINT          -- milliseconds since previous block
);
SELECT create_hypertable('block_events', 'ts', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS idx_block_events_height ON block_events (height DESC);

-- ═══════════════════════════════════════════════════════════════
-- NETWORK SNAPSHOTS
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS network_snapshots (
    ts                      TIMESTAMPTZ     NOT NULL,
    peer_id                 TEXT            NOT NULL,
    n_peers                 INT             NOT NULL,
    n_connections           INT             NOT NULL,
    n_pending_connections   INT             NOT NULL
);
SELECT create_hypertable('network_snapshots', 'ts', if_not_exists => TRUE);

-- ═══════════════════════════════════════════════════════════════
-- CHAIN STATS (hourly rollups for explorer overview)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS chain_stats_hourly (
    bucket              TIMESTAMPTZ     NOT NULL UNIQUE,
    blocks_produced     BIGINT          NOT NULL DEFAULT 0,
    avg_block_time_ms   BIGINT,
    min_block_time_ms   BIGINT,
    max_block_time_ms   BIGINT,
    height_start        BIGINT,
    height_end          BIGINT,
    avg_peers           DOUBLE PRECISION,
    avg_connections     DOUBLE PRECISION
);

-- ═══════════════════════════════════════════════════════════════
-- CONTINUOUS AGGREGATES
-- ═══════════════════════════════════════════════════════════════
CREATE MATERIALIZED VIEW IF NOT EXISTS blocks_per_minute
WITH (timescaledb.continuous) AS
    SELECT
        time_bucket('1 minute', ts) AS bucket,
        COUNT(*) AS block_count
    FROM blocks
    GROUP BY bucket
WITH NO DATA;

SELECT add_continuous_aggregate_policy('blocks_per_minute',
    start_offset    => INTERVAL '1 hour',
    end_offset      => INTERVAL '1 minute',
    schedule_interval => INTERVAL '1 minute',
    if_not_exists   => TRUE
);

-- ═══════════════════════════════════════════════════════════════
-- RETENTION
-- ═══════════════════════════════════════════════════════════════
SELECT add_retention_policy('consensus_snapshots', INTERVAL '90 days', if_not_exists => TRUE);
SELECT add_retention_policy('network_snapshots', INTERVAL '90 days', if_not_exists => TRUE);
SELECT add_retention_policy('block_events', INTERVAL '90 days', if_not_exists => TRUE);
