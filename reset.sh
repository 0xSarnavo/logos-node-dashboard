#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

echo "================================================"
echo "  Logos Node Dashboard - Reset"
echo "================================================"
echo ""
echo "This will DELETE all monitoring data:"
echo "  - Prometheus metrics"
echo "  - TimescaleDB blockchain data"
echo ""
echo "Your node is NOT affected."
echo ""
read -p "Are you sure? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
  echo "Cancelled."
  exit 0
fi

echo ""
echo "Stopping services..."
docker compose down -v

echo "Removing credentials..."
rm -f .env

echo ""
echo "Reset complete. Run ./start.sh to set up fresh."
