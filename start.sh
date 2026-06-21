#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# ─── First-run setup: password prompt ────────────────────────────
FIRST_RUN=false
if [ ! -f .env ]; then
  FIRST_RUN=true
  echo "================================================"
  echo "  Logos Node Dashboard - First Time Setup"
  echo "================================================"
  echo ""
  echo "Set a password for the dashboard."
  echo "Leave blank to allow access without a password."
  echo ""
  echo "  Username will be: admin"
  echo ""

  while true; do
    read -sp "  Password (hidden): " PASSWORD
    echo ""

    if [ -z "$PASSWORD" ]; then
      break
    fi

    read -sp "  Confirm password:  " PASSWORD2
    echo ""

    if [ "$PASSWORD" = "$PASSWORD2" ]; then
      break
    else
      echo ""
      echo "  Passwords don't match. Try again."
      echo ""
    fi
  done

  if [ -z "$PASSWORD" ]; then
    echo ""
    echo "  No password set. Dashboard will allow anonymous viewing."
    echo "  You can change this later by editing .env"
    echo ""
    cat > .env <<EOF
# Dashboard credentials
GRAFANA_ADMIN_PASSWORD=admin
GRAFANA_ANON_ENABLED=true
# TimescaleDB (internal, not exposed)
DB_PASSWORD=$(openssl rand -hex 16)
EOF
  else
    if [ ${#PASSWORD} -lt 8 ]; then
      echo "  WARNING: Password is short (<8 chars). Continuing anyway..."
    fi
    cat > .env <<EOF
# Dashboard credentials - do not commit this file
GRAFANA_ADMIN_PASSWORD=${PASSWORD}
GRAFANA_ANON_ENABLED=false
# TimescaleDB (internal, not exposed)
DB_PASSWORD=$(openssl rand -hex 16)
EOF
    echo ""
    echo "  Credentials saved."
    echo "    Username: admin"
    echo "    Password: <what you just entered>"
  fi
  echo ""
  chmod 600 .env
fi

# ─── Docker check ───────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  echo "ERROR: Docker is not installed. Please install Docker Desktop."
  exit 1
fi

if ! docker info &>/dev/null 2>&1; then
  echo "ERROR: Docker daemon is not running. Please start Docker Desktop."
  exit 1
fi

# ─── Source config ──────────────────────────────────────────────
source .env 2>/dev/null || true

# ─── Clean up stale containers from previous runs ──────────────
OLD_CONTAINERS=$(docker ps -a --filter "name=logos-" --filter "status=exited" --filter "status=dead" --filter "status=created" --format "{{.Names}}" 2>/dev/null || true)
if [ -n "$OLD_CONTAINERS" ]; then
  echo "Cleaning up old containers..."
  docker rm -f $OLD_CONTAINERS 2>/dev/null || true
fi

# ─── Check if images need downloading ──────────────────────────
IMAGES=(
  "grafana/grafana:11.1.0"
  "prom/prometheus:v2.53.0"
  "grafana/loki:3.1.0"
  "grafana/tempo:2.5.0"
  "otel/opentelemetry-collector-contrib:0.100.0"
  "prom/node-exporter:v1.8.1"
  "timescale/timescaledb:latest-pg16"
)

NEED_PULL=()
for img in "${IMAGES[@]}"; do
  if ! docker image inspect "$img" &>/dev/null; then
    NEED_PULL+=("$img")
  fi
done

if [ ${#NEED_PULL[@]} -gt 0 ]; then
  echo "================================================"
  echo "  Downloading ${#NEED_PULL[@]} container images..."
  echo "  This only happens once. May take a few minutes"
  echo "  depending on your internet speed."
  echo "================================================"
  echo ""

  TOTAL=${#NEED_PULL[@]}
  CURRENT=0

  for img in "${NEED_PULL[@]}"; do
    CURRENT=$((CURRENT + 1))
    SHORT_NAME=$(echo "$img" | cut -d'/' -f2 | cut -d':' -f1)
    echo "  [$CURRENT/$TOTAL] Pulling $SHORT_NAME..."
    docker pull -q "$img" > /dev/null 2>&1 && \
      echo "         Done." || \
      echo "         Failed — will retry on start."
  done
  echo ""
fi

# ─── Build indexer ──────────────────────────────────────────────
if [ "$FIRST_RUN" = true ] || ! docker image inspect logos-node-dashboard-indexer &>/dev/null 2>&1; then
  echo "  Building indexer..."
  docker compose build --quiet indexer 2>/dev/null || true
  echo ""
fi

# ─── Start ──────────────────────────────────────────────────────
echo "================================================"
echo "  Logos Node Dashboard"
echo "================================================"
echo ""
echo "  Grafana:      http://localhost:3333"
if [ "${GRAFANA_ANON_ENABLED:-false}" = "true" ]; then
  echo "  Auth:         No login required"
else
  echo "  Login:        Username: admin"
  echo "                Password: <your password>"
fi
echo ""
echo "  Node API:     http://localhost:8080 (your node)"
echo "  Indexer:      polls node -> TimescaleDB every 10s"
echo ""
echo "  All other services are internal-only."
echo ""
echo "================================================"
echo ""

echo "Starting services..."
docker compose up -d --quiet-pull 2>/dev/null || docker compose up -d

# ─── Wait and verify ───────────────────────────────────────────
echo ""
echo "Waiting for services to be ready..."

SERVICES=("logos-grafana" "logos-prometheus" "logos-loki" "logos-otel-collector" "logos-node-exporter" "logos-tempo" "logos-timescaledb" "logos-indexer")
MAX_WAIT=30
ELAPSED=0

while [ "$ELAPSED" -lt "$MAX_WAIT" ]; do
  ALL_UP=true
  for svc in "${SERVICES[@]}"; do
    STATUS=$(docker inspect --format='{{.State.Status}}' "$svc" 2>/dev/null || echo "missing")
    if [ "$STATUS" != "running" ]; then
      ALL_UP=false
      break
    fi
  done

  if [ "$ALL_UP" = true ]; then
    break
  fi

  sleep 2
  ELAPSED=$((ELAPSED + 2))
  printf "\r  Starting... %ds" "$ELAPSED"
done
echo ""
echo ""

# ─── Status report ──────────────────────────────────────────────
ALL_OK=true
for svc in "${SERVICES[@]}"; do
  STATUS=$(docker inspect --format='{{.State.Status}}' "$svc" 2>/dev/null || echo "missing")
  SHORT=$(echo "$svc" | sed 's/logos-//')
  if [ "$STATUS" = "running" ]; then
    echo "  [OK] $SHORT"
  else
    echo "  [!!] $SHORT — $STATUS"
    ALL_OK=false
  fi
done

echo ""
if [ "$ALL_OK" = true ]; then
  echo "All services running. Open http://localhost:3333"
else
  echo "Some services failed. Run: docker compose logs"
fi
echo ""
echo "  Commands:"
echo "    ./upgrade.sh      Pull latest + rolling restart"
echo "    ./stop.sh         Stop (data preserved)"
echo "    ./reset.sh        Full wipe"
