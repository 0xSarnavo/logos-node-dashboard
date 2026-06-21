"""
Logos Node Indexer
Polls the node API and stores data in TimescaleDB.
Tracks block production events, block times, network state, and peer geolocation.
"""

import os
import re
import sys
import time
import signal
import logging
import urllib.request
import json
from datetime import datetime, timezone

import psycopg2

NODE_API = os.environ.get("NODE_API", "http://host.docker.internal:8080")
DB_DSN = os.environ.get("DB_DSN", "postgresql://logos:logos@timescaledb:5432/logos")
POLL_INTERVAL = int(os.environ.get("POLL_INTERVAL", "10"))
NODE_LOG_DIR = os.environ.get("NODE_LOG_DIR", "/node-logs")

BOOTSTRAP_IPS = {"65.109.51.37"}

IP4_PATTERN = re.compile(r"/ip4/(\d+\.\d+\.\d+\.\d+)/")

PRIVATE_RANGES = [
    re.compile(r"^10\."),
    re.compile(r"^127\."),
    re.compile(r"^192\.168\."),
    re.compile(r"^172\.(1[6-9]|2[0-9]|3[01])\."),
    re.compile(r"^100\."),
    re.compile(r"^0\."),
    re.compile(r"^169\.254\."),
]

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
log = logging.getLogger("indexer")

shutdown = False
last_height = None
last_height_ts = None


def handle_signal(signum, frame):
    global shutdown
    log.info("Shutdown signal received")
    shutdown = True


signal.signal(signal.SIGTERM, handle_signal)
signal.signal(signal.SIGINT, handle_signal)


def api_get(path, timeout=5):
    try:
        req = urllib.request.Request(f"{NODE_API}/{path}")
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            if resp.status == 200:
                return json.loads(resp.read().decode())
    except Exception as e:
        log.warning("API %s: %s", path, e)
    return None


def is_private_ip(ip):
    """Check if an IP address is in a private/reserved range."""
    for pattern in PRIVATE_RANGES:
        if pattern.match(ip):
            return True
    return False


def scrape_peer_ips():
    """Read node log files and extract unique public IP addresses."""
    if not os.path.isdir(NODE_LOG_DIR):
        log.warning("Node log directory not found: %s", NODE_LOG_DIR)
        return set()

    all_ips = set()
    try:
        for entry in os.listdir(NODE_LOG_DIR):
            filepath = os.path.join(NODE_LOG_DIR, entry)
            if not os.path.isfile(filepath):
                continue
            try:
                with open(filepath, "r", errors="ignore") as f:
                    for line in f:
                        matches = IP4_PATTERN.findall(line)
                        all_ips.update(matches)
            except Exception as e:
                log.warning("Error reading log file %s: %s", entry, e)
    except Exception as e:
        log.warning("Error scanning log directory: %s", e)

    public_ips = {ip for ip in all_ips if not is_private_ip(ip)}
    log.info("Scraped %d unique public IPs from node logs", len(public_ips))
    return public_ips


def geolocate_ips(ips):
    """Geolocate IPs using ip-api.com batch endpoint. Returns list of result dicts."""
    ips = list(ips)
    results = []
    batch_size = 100

    for i in range(0, len(ips), batch_size):
        batch = ips[i:i + batch_size]
        queries = [
            {"query": ip, "fields": "status,country,countryCode,city,lat,lon,isp,query"}
            for ip in batch
        ]
        try:
            data = json.dumps(queries).encode("utf-8")
            req = urllib.request.Request(
                "http://ip-api.com/batch",
                data=data,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=15) as resp:
                if resp.status == 200:
                    batch_results = json.loads(resp.read().decode())
                    results.extend(batch_results)
                else:
                    log.warning("ip-api batch returned status %d", resp.status)
        except Exception as e:
            log.warning("ip-api batch error: %s", e)

        # Rate limit: sleep between batches
        if i + batch_size < len(ips):
            time.sleep(1.5)

    return results


def index_peers(conn):
    """Scrape peer IPs from logs and geolocate them."""
    ips = scrape_peer_ips()
    if not ips:
        return 0

    # Find IPs not yet in the database or not seen recently
    with conn.cursor() as cur:
        cur.execute("SELECT ip FROM peers")
        known_ips = {row[0] for row in cur.fetchall()}

    new_ips = ips - known_ips
    # Update last_seen for all known IPs we still see
    seen_ips = ips & known_ips
    if seen_ips:
        with conn.cursor() as cur:
            for ip in seen_ips:
                cur.execute("UPDATE peers SET last_seen = NOW() WHERE ip = %s", (ip,))

    # Geolocate new IPs
    if new_ips:
        geo_results = geolocate_ips(new_ips)
        with conn.cursor() as cur:
            for result in geo_results:
                if result.get("status") != "success":
                    continue
                ip = result["query"]
                cur.execute(
                    """INSERT INTO peers (ip, lat, lon, country, country_code, city, isp, is_bootstrap)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                       ON CONFLICT (ip) DO UPDATE SET
                           lat = EXCLUDED.lat, lon = EXCLUDED.lon,
                           country = EXCLUDED.country, country_code = EXCLUDED.country_code,
                           city = EXCLUDED.city, isp = EXCLUDED.isp,
                           last_seen = NOW()""",
                    (ip, result.get("lat"), result.get("lon"),
                     result.get("country"), result.get("countryCode"),
                     result.get("city"), result.get("isp"),
                     ip in BOOTSTRAP_IPS),
                )
        log.info("Geolocated %d new peer IPs", len(new_ips))
    else:
        log.info("No new peer IPs to geolocate (updated %d last_seen)", len(seen_ips))

    return len(new_ips)


def connect_db(retries=30, delay=2):
    for attempt in range(1, retries + 1):
        try:
            conn = psycopg2.connect(DB_DSN)
            conn.autocommit = True
            log.info("Connected to TimescaleDB")
            return conn
        except psycopg2.OperationalError as e:
            log.warning("DB attempt %d/%d: %s", attempt, retries, e)
            time.sleep(delay)
    log.error("Could not connect after %d attempts", retries)
    sys.exit(1)


def ensure_tables(conn):
    """Create all tables if they don't exist (handles fresh installs and upgrades)."""
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS consensus_snapshots (
                ts              TIMESTAMPTZ     NOT NULL,
                block_height    BIGINT          NOT NULL,
                slot            BIGINT          NOT NULL,
                lib_slot        BIGINT          NOT NULL,
                lib_hash        TEXT            NOT NULL,
                tip_hash        TEXT            NOT NULL,
                mode            TEXT            NOT NULL
            );
            CREATE TABLE IF NOT EXISTS blocks (
                ts              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
                block_hash      TEXT            NOT NULL UNIQUE,
                height          BIGINT          NOT NULL,
                slot            BIGINT,
                is_orphaned     BOOLEAN         NOT NULL DEFAULT FALSE
            );
            CREATE TABLE IF NOT EXISTS block_events (
                ts              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
                height          BIGINT          NOT NULL,
                tip_hash        TEXT            NOT NULL,
                block_time_ms   BIGINT
            );
            CREATE TABLE IF NOT EXISTS network_snapshots (
                ts                      TIMESTAMPTZ     NOT NULL,
                peer_id                 TEXT            NOT NULL,
                n_peers                 INT             NOT NULL,
                n_connections           INT             NOT NULL,
                n_pending_connections   INT             NOT NULL
            );
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
            CREATE TABLE IF NOT EXISTS block_content (
                block_hash      TEXT            PRIMARY KEY,
                height          BIGINT          NOT NULL,
                slot            BIGINT          NOT NULL,
                version         INT             DEFAULT 0,
                parent_hash     TEXT            NOT NULL,
                block_root      TEXT,
                voucher_cm      TEXT,
                entropy         TEXT,
                leader_key      TEXT,
                block_size      INT             NOT NULL,
                tx_count        INT             DEFAULT 0,
                indexed_at      TIMESTAMPTZ     DEFAULT NOW()
            );
            CREATE TABLE IF NOT EXISTS peers (
                ip              TEXT            NOT NULL UNIQUE,
                lat             DOUBLE PRECISION,
                lon             DOUBLE PRECISION,
                country         TEXT,
                country_code    TEXT,
                city            TEXT,
                isp             TEXT,
                is_bootstrap    BOOLEAN         DEFAULT FALSE,
                first_seen      TIMESTAMPTZ     DEFAULT NOW(),
                last_seen       TIMESTAMPTZ     DEFAULT NOW()
            );
        """)
        # Make hypertables (ignore if already done)
        for tbl in ['consensus_snapshots', 'blocks', 'block_events', 'network_snapshots']:
            try:
                cur.execute(f"SELECT create_hypertable('{tbl}', 'ts', if_not_exists => TRUE);")
            except Exception:
                pass
        # Indexes
        for stmt in [
            "CREATE INDEX IF NOT EXISTS idx_blocks_height ON blocks (height DESC)",
            "CREATE INDEX IF NOT EXISTS idx_blocks_hash ON blocks (block_hash)",
            "CREATE INDEX IF NOT EXISTS idx_block_events_height ON block_events (height DESC)",
        ]:
            try:
                cur.execute(stmt)
            except Exception:
                pass


def index_consensus(conn):
    global last_height, last_height_ts

    data = api_get("cryptarchia/info")
    if not data:
        return None

    now = datetime.now(timezone.utc)
    height = data["height"]

    with conn.cursor() as cur:
        cur.execute(
            """INSERT INTO consensus_snapshots
               (ts, block_height, slot, lib_slot, lib_hash, tip_hash, mode)
               VALUES (%s, %s, %s, %s, %s, %s, %s)""",
            (now, height, data["slot"], data["lib_slot"],
             data["lib"], data["tip"], data["mode"]),
        )

        # Track new block events with block time calculation
        if last_height is not None and height > last_height:
            block_time_ms = int((now - last_height_ts).total_seconds() * 1000)
            # Record each new height (may skip some if multiple blocks in one poll)
            cur.execute(
                """INSERT INTO block_events (ts, height, tip_hash, block_time_ms)
                   VALUES (%s, %s, %s, %s)""",
                (now, height, data["tip"], block_time_ms),
            )

        if last_height is None or height > last_height:
            last_height = height
            last_height_ts = now

    return data


def index_network(conn):
    data = api_get("network/info")
    if not data:
        return None

    now = datetime.now(timezone.utc)
    with conn.cursor() as cur:
        cur.execute(
            """INSERT INTO network_snapshots
               (ts, peer_id, n_peers, n_connections, n_pending_connections)
               VALUES (%s, %s, %s, %s, %s)""",
            (now, data["peer_id"], data["n_peers"],
             data["n_connections"], data["n_pending_connections"]),
        )
    return data


def index_blocks(conn, consensus_data):
    if not consensus_data:
        return 0

    headers = api_get("cryptarchia/headers")
    if not headers or not isinstance(headers, list):
        return 0

    height = consensus_data["height"]
    inserted = 0
    orphaned = 0

    with conn.cursor() as cur:
        for i, block_hash in enumerate(headers):
            estimated_height = height - i

            # Check if this height already has a different hash (reorg = orphan)
            cur.execute(
                "SELECT block_hash FROM blocks WHERE height = %s AND block_hash != %s LIMIT 1",
                (estimated_height, block_hash),
            )
            old = cur.fetchone()
            if old:
                # Mark the old block at this height as orphaned
                cur.execute(
                    "UPDATE blocks SET is_orphaned = TRUE WHERE height = %s AND block_hash = %s",
                    (estimated_height, old[0]),
                )
                orphaned += 1
                log("orphan detected: height=%d old=%s new=%s", estimated_height, old[0][:16], block_hash[:16])

            cur.execute(
                """INSERT INTO blocks (block_hash, height)
                   VALUES (%s, %s)
                   ON CONFLICT (block_hash) DO NOTHING""",
                (block_hash, estimated_height),
            )
            if cur.rowcount > 0:
                inserted += 1

    if orphaned:
        log("reorg: %d orphaned blocks detected", orphaned)
    return inserted


SIDECAR_API = os.environ.get("SIDECAR_API", "http://sidecar:8081")


def index_block_content(conn, batch_size=10):
    """Fetch block content from sidecar and store in DB for fast queries."""
    with conn.cursor() as cur:
        # Find blocks that don't have content indexed yet
        cur.execute("""
            SELECT b.block_hash, b.height
            FROM blocks b
            LEFT JOIN block_content bc ON b.block_hash = bc.block_hash
            WHERE bc.block_hash IS NULL
            ORDER BY b.height DESC
            LIMIT %s
        """, (batch_size,))
        missing = cur.fetchall()

    if not missing:
        return 0

    indexed = 0
    for block_hash, height in missing:
        try:
            url = f"{SIDECAR_API}/block/{block_hash}"
            req = urllib.request.Request(url)
            with urllib.request.urlopen(req, timeout=10) as resp:
                if resp.status != 200:
                    continue
                data = json.loads(resp.read().decode())

            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO block_content
                        (block_hash, height, slot, version, parent_hash,
                         block_root, voucher_cm, entropy, leader_key,
                         block_size, tx_count)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (block_hash) DO NOTHING
                """, (
                    block_hash, height,
                    data.get("slot", 0),
                    data.get("version", 0),
                    data.get("parent_hash", ""),
                    data.get("block_root"),
                    data.get("voucher_cm"),
                    data.get("entropy"),
                    data.get("leader_key"),
                    data.get("size", 0),
                    data.get("tx_count", 0),
                ))
            indexed += 1
        except Exception as e:
            log.warning("block content index error h=%d: %s", height, e)

    if indexed:
        log.info("Indexed %d block contents from sidecar", indexed)
    return indexed


def update_hourly_stats(conn):
    """Roll up hourly chain statistics."""
    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO chain_stats_hourly (
                bucket, blocks_produced, avg_block_time_ms,
                min_block_time_ms, max_block_time_ms,
                height_start, height_end, avg_peers, avg_connections
            )
            SELECT
                b.bucket,
                b.blocks_produced,
                b.avg_block_time_ms,
                b.min_block_time_ms,
                b.max_block_time_ms,
                b.height_start,
                b.height_end,
                n.avg_peers,
                n.avg_connections
            FROM (
                SELECT
                    time_bucket('1 hour', ts) AS bucket,
                    COUNT(*) AS blocks_produced,
                    AVG(block_time_ms)::BIGINT AS avg_block_time_ms,
                    MIN(block_time_ms) AS min_block_time_ms,
                    MAX(block_time_ms) AS max_block_time_ms,
                    MIN(height) AS height_start,
                    MAX(height) AS height_end
                FROM block_events
                WHERE ts > NOW() - INTERVAL '2 hours'
                GROUP BY bucket
            ) b
            LEFT JOIN (
                SELECT
                    time_bucket('1 hour', ts) AS bucket,
                    AVG(n_peers) AS avg_peers,
                    AVG(n_connections) AS avg_connections
                FROM network_snapshots
                WHERE ts > NOW() - INTERVAL '2 hours'
                GROUP BY bucket
            ) n ON b.bucket = n.bucket
            ON CONFLICT (bucket) DO UPDATE SET
                blocks_produced = EXCLUDED.blocks_produced,
                avg_block_time_ms = EXCLUDED.avg_block_time_ms,
                min_block_time_ms = EXCLUDED.min_block_time_ms,
                max_block_time_ms = EXCLUDED.max_block_time_ms,
                height_start = EXCLUDED.height_start,
                height_end = EXCLUDED.height_end,
                avg_peers = EXCLUDED.avg_peers,
                avg_connections = EXCLUDED.avg_connections
        """)


def main():
    log.info("Logos Node Indexer starting")
    log.info("  Node API:      %s", NODE_API)
    log.info("  Poll interval: %ds", POLL_INTERVAL)

    conn = connect_db()
    ensure_tables(conn)

    cycle = 0
    while not shutdown:
        try:
            consensus = index_consensus(conn)
            net = index_network(conn)

            # Index blocks every 3rd cycle (~9s at 3s poll)
            new_blocks = 0
            if cycle % 3 == 0:
                new_blocks = index_blocks(conn, consensus)

            # Peer geolocation every 100th cycle (~5min at 3s poll)
            if cycle % 100 == 0:
                try:
                    new_peers = index_peers(conn)
                    if new_peers:
                        log.info("Indexed %d new peers", new_peers)
                except Exception as e:
                    log.warning("Peer indexing error: %s", e)

            # Index block content every 10th cycle (~30s at 3s poll)
            if cycle % 10 == 0:
                try:
                    index_block_content(conn, batch_size=20)
                except Exception as e:
                    log.warning("Block content indexing error: %s", e)

            # Hourly stats every 200th cycle (~10min at 3s poll)
            if cycle % 200 == 0:
                update_hourly_stats(conn)

            if consensus and net:
                log.info(
                    "h=%d s=%d lib=%d peers=%d conn=%d mode=%s%s",
                    consensus["height"], consensus["slot"],
                    consensus["lib_slot"], net["n_peers"],
                    net["n_connections"], consensus["mode"],
                    f" +{new_blocks}blk" if new_blocks else "",
                )

        except psycopg2.Error as e:
            log.error("DB error: %s", e)
            try:
                conn.close()
            except Exception:
                pass
            conn = connect_db()
            ensure_tables(conn)

        except Exception as e:
            log.error("Error: %s", e)

        cycle += 1
        time.sleep(POLL_INTERVAL)

    log.info("Indexer stopped")
    conn.close()


if __name__ == "__main__":
    main()
