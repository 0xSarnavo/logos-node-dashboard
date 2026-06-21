#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "================================================"
echo "  Logos Node Dashboard - Upgrade"
echo "================================================"
echo ""

# ─── Checks ────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  echo "ERROR: Docker is not installed."
  exit 1
fi

if ! docker info &>/dev/null 2>&1; then
  echo "ERROR: Docker daemon is not running."
  exit 1
fi

if [ ! -f .env ]; then
  echo "ERROR: No .env found. Run ./start.sh first."
  exit 1
fi

# ─── Stop old containers ──────────────────────────────────────
echo "[1/7] Stopping old containers..."

# Stop compose-managed containers
docker compose down --remove-orphans 2>/dev/null || true

# Kill any leftover containers by name that compose might not track
# (handles renamed services, old compose versions, manual docker run)
OLD_CONTAINERS=$(docker ps -a --filter "name=logos-" --format "{{.Names}}" 2>/dev/null || true)
if [ -n "$OLD_CONTAINERS" ]; then
  echo "  Found old containers:"
  for c in $OLD_CONTAINERS; do
    echo "    - $c"
  done
  docker rm -f $OLD_CONTAINERS 2>/dev/null || true
  echo "  Removed."
else
  echo "  No stale containers found."
fi
echo ""

# ─── Pull latest images ───────────────────────────────────────
echo "[2/7] Pulling latest images..."
echo ""
docker compose pull
echo ""

# ─── Rebuild indexer ──────────────────────────────────────────
echo "[3/7] Rebuilding indexer..."
docker compose build --no-cache indexer
echo ""

# ─── Start fresh containers ──────────────────────────────────
echo "[4/7] Starting containers (volumes preserved)..."
echo ""
docker compose up -d --force-recreate
echo ""

# ─── Wait for services to be healthy ─────────────────────────
echo "[5/7] Waiting for services to start..."
sleep 5

# ─── Cleanup old images ─────────────────────────────────────
echo "[6/7] Cleaning up..."

# Remove old/dangling images
CLEANED=$(docker image prune -f 2>/dev/null | tail -1 || echo "nothing")
echo "  Images: $CLEANED"

# Remove old dangling volumes (NOT named ones — those have data)
docker volume prune -f --filter "label!=com.docker.compose.volume" 2>/dev/null || true
echo ""

# ─── Verify ──────────────────────────────────────────────────
echo "[7/7] Verifying services..."
echo ""

SERVICES=("logos-grafana" "logos-prometheus" "logos-loki" "logos-otel-collector" "logos-node-exporter" "logos-tempo" "logos-timescaledb" "logos-indexer")
ALL_OK=true
RETRIES=0
MAX_RETRIES=3

while [ "$RETRIES" -lt "$MAX_RETRIES" ]; do
  ALL_OK=true
  for svc in "${SERVICES[@]}"; do
    STATUS=$(docker inspect --format='{{.State.Status}}' "$svc" 2>/dev/null || echo "missing")
    if [ "$STATUS" != "running" ]; then
      ALL_OK=false
      break
    fi
  done

  if [ "$ALL_OK" = true ]; then
    break
  fi

  RETRIES=$((RETRIES + 1))
  if [ "$RETRIES" -lt "$MAX_RETRIES" ]; then
    echo "  Some services still starting... (retry $RETRIES/$MAX_RETRIES)"
    sleep 5
  fi
done

for svc in "${SERVICES[@]}"; do
  STATUS=$(docker inspect --format='{{.State.Status}}' "$svc" 2>/dev/null || echo "missing")
  IMAGE=$(docker inspect --format='{{.Config.Image}}' "$svc" 2>/dev/null || echo "unknown")
  if [ "$STATUS" = "running" ]; then
    echo "  [OK] $svc  ($IMAGE)"
  else
    echo "  [!!] $svc  — $STATUS"
    # Show last few log lines for failed services
    echo "       Last logs:"
    docker logs --tail 5 "$svc" 2>&1 | sed 's/^/       /'
    ALL_OK=false
  fi
done

echo ""
echo "─────────────────────────────────────────────────"
if [ "$ALL_OK" = true ]; then
  echo "  Upgrade complete. All services running."
  echo ""
  echo "  Data preserved in Docker volumes:"
  echo "    prometheus-data    (metrics)"
  echo "    loki-data          (logs)"
  echo "    tempo-data         (traces)"
  echo "    timescale-data     (blockchain data)"
  echo "    grafana-data       (dashboard settings)"
else
  echo "  WARNING: Some services failed to start."
  echo "  Run: docker compose logs <service-name>"
fi
echo ""
echo "  Dashboard: http://localhost:3333"
echo "─────────────────────────────────────────────────"
