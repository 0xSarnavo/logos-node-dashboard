#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

echo "Stopping Logos Node Dashboard..."
docker compose down

echo ""
echo "Stopped. Data is preserved in Docker volumes."
echo "Run ./start.sh to restart."
