# Logos Node Dashboard

A self-hosted, dark-mode **block explorer & monitoring dashboard** for a [Logos](https://logos.co) (Nomos / Cryptarchia) blockchain node. It pairs a custom **Next.js explorer** with TimescaleDB + Prometheus and runs entirely locally via Docker Compose.

> Explorer UI → **http://localhost:3333**

> **Disclaimer:** This is an independent, community-built project by a standalone developer. It is **not** affiliated with, endorsed by, or maintained by the Logos / Nomos core dev team. Provided as-is.

---

## Features

The custom explorer (`/app`) gives you, in real time:

| Page | What it shows |
|------|---------------|
| **Home** (`/`) | Live chain stats, a "jump into any section" card grid, latest blocks + latest decoded transactions, chain activity, slot-fill bar |
| **Blocks** (`/blocks`) | Block list with status/speed/time filters, block-time distribution, a **live slot strip** (final / live / empty), per-block detail (`/blocks/[height]`) |
| **Transactions** (`/transactions`) | **Decoded** transactions (Transfer, ChannelInscribe…) with confirmed/pending status, click-a-block-to-filter, time-period filter, full operation breakdown (`/transactions/[hash]`) |
| **Peers** (`/peers`) | Interactive **rotating 3D globe** (drag / scroll-zoom), per-node status, your own node in blue, leaderboards (longest-tracked, top countries, top networks), searchable peer table |
| **My Node** (`/node`) | Sync ring, health checks, bento metric tiles, time-range charts (5m → 1y), wallets, consensus state, network identity (location / ISP) |
| **Faucet** (`/faucet`) | Server-side faucet runner with live session stats, graphs (calls/min, grants vs duplicates, latency), per-wallet activity logs |

Transaction detail is decoded straight from the node's `POST /storage/block` endpoint; raw block content comes from a sidecar that reads the node's RocksDB.

---

## Architecture

```
                         ┌──────────────────────────────┐
   Logos Node            │  Next.js Explorer (:3333)     │
   ┌───────────┐  HTTP   │  app/  — pages + /api routes  │
   │  node API │◀────────│   • node/peers/faucet/chain   │
   │  :8080    │         │   • /storage/block (decode)   │
   └─────┬─────┘         └──────────────┬───────────────┘
         │ RocksDB                      │ SQL
         ▼                              ▼
   ┌───────────┐  HTTP   ┌──────────────────────────────┐
   │  Sidecar  │◀────────│        TimescaleDB           │
   │  :8081    │  block  │  blocks · block_content ·    │
   │ (ldb read)│ content │  peers · *_snapshots · faucet │
   └───────────┘         └──────────────▲───────────────┘
         ▲                              │ writes
         │ reads RocksDB         ┌──────┴──────┐
   ┌─────┴─────┐   polls node    │   Indexer   │
   │ node data │◀────────────────│ indexer.py  │
   └───────────┘                 └─────────────┘

   Host metrics:  node-exporter ──▶ Prometheus ──▶ explorer (VM panel)
```

### Docker services

| Service | Build / image | Port (localhost) | Role |
|---------|---------------|------------------|------|
| `explorer` | `./app` (Next.js 14) | `3333` | Dashboard UI + API routes |
| `indexer` | `./indexer` (Python) | — | Polls the node API, geolocates peers, writes analytics to TimescaleDB |
| `sidecar` | `./sidecar` (Python) | `8081` (internal) | Reads node RocksDB via `ldb` to expose raw/parsed block content |
| `timescaledb` | `timescale/timescaledb` | `5432` (internal) | Time-series + relational store |
| `prometheus` | `prom/prometheus` | `9090` | Metrics |
| `node-exporter` | — | internal | host CPU/mem/disk metrics |

---

## Prerequisites

- **Docker** and **Docker Compose v2** (`docker compose …`)
- A **running Logos node** with:
  - its HTTP API reachable at `http://host.docker.internal:8080` (or set `NODE_API`)
  - its data directory (`state/db` RocksDB + logs) readable on the host
- ~2 GB free RAM for the full stack

> Point the dashboard at your node by setting **`NODE_DIR`** in `.env` (no need to
> edit `docker-compose.yml` anymore). It defaults to a sibling `../logos-node`.

---

## Quick start (any platform — just Docker)

Works the same on **macOS, Linux, Raspberry Pi, WSL2, and cloud VMs** — Docker
auto-selects the right CPU architecture (arm64 / amd64).

```bash
git clone <this-repo>
cd logos-node-dashboard

cp .env.example .env                 # set NODE_DIR (path to your logos-node dir)
docker compose up -d --build         # build + start the lean stack
```

Open **http://localhost:3333** (explorer). That's it.

**Choose how much to run** with `COMPOSE_PROFILES` in `.env` (Compose reads it automatically):

| `COMPOSE_PROFILES` | Starts | Use on |
|---|---|---|
| *(empty)* | explorer + db + indexer + sidecar + prometheus + node-exporter | laptop / Pi / WSL / dev |
| `public` | + Caddy (HTTPS via your domain) | a public server |

Per-platform notes:
- **Raspberry Pi / 1–2 vCPU:** keep profiles empty and set `POLL_INTERVAL=5` in `.env`.
- **WSL2:** keep this repo and the node under the Linux home (`~/...`), not `/mnt/c` (bind mounts off `/mnt/c` are slow).
- **Cloud VM (public):** set `COMPOSE_PROFILES=public`, point a domain at it, and put your domain in `Caddyfile` (see `Caddyfile.example`).

Guided helper scripts are also provided:

```bash
./start.sh      # first-run password prompt + start
./stop.sh       # stop (data preserved)
./upgrade.sh    # pull / rebuild, rolling restart, no data loss
./reset.sh      # full wipe (deletes all data + credentials)
```

---

## Development (hot-reload)

The production `explorer` image is baked at build time — navigation is fast, but code edits require a rebuild. For active development use the dev override, which mounts `./app` and runs `next dev` with hot-reload while staying on the same Docker network (so it still reaches TimescaleDB and the node):

```bash
# hot-reload dev server (edits appear instantly)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d explorer

# back to the fast production build
docker compose up -d --build explorer
```

Run the app outside Docker (note: it can't reach `timescaledb` / the node unless those ports are exposed):

```bash
cd app
npm install
npm run dev            # http://localhost:3000
```

Quality checks:

```bash
cd app
npx tsc --noEmit       # type-check
npx next lint          # lint (first run sets up ESLint config)
```

---

## Project structure

```
logos-node-dashboard/
├── app/                       # Next.js 14 explorer (App Router, TypeScript, Tailwind)
│   ├── src/app/               # pages + /api routes
│   ├── src/components/        # TopNav, PeerWorldMap, charts, InfoTip, SlotStrip…
│   ├── src/lib/               # db, node client, tx decoder, ranges, types
│   └── Dockerfile             # multi-stage production build (standalone output)
├── indexer/                   # Python indexer (node → TimescaleDB) + init.sql schema
├── sidecar/                   # Python sidecar (reads node RocksDB via ldb)
├── prometheus/                # scrape config
├── docker-compose.yml         # full stack
├── docker-compose.dev.yml     # explorer hot-reload override
├── .env.example               # copy to .env
└── start.sh / stop.sh / upgrade.sh / reset.sh
```

---

## Configuration / Environment

Copy `.env.example` → `.env` (gitignored). Key variables:

| Variable | Used by | Default | Notes |
|----------|---------|---------|-------|
| `DB_PASSWORD` | TimescaleDB | `logos_internal_db` | Internal DB password (not publicly exposed) |
| `NODE_API` | explorer, indexer | `http://host.docker.internal:8080` | Logos node HTTP API |
| `SIDECAR_API` | explorer, indexer | `http://sidecar:8081` | Sidecar URL (internal) |
| `WALLET_KEYS` | explorer (faucet / wallets) | _(two demo keys)_ | Comma-separated 64-hex wallet public keys to track |
| `POLL_INTERVAL` | indexer | `3` | Seconds between node polls |

The explorer's DB connection (`DB_HOST/PORT/NAME/USER/PASSWORD`) and the node/sidecar URLs are wired in `docker-compose.yml`.

---

## Security notes

- All published ports bind to `127.0.0.1` (localhost only); internal services aren't exposed.
- Real secrets live in `.env` (gitignored). `.env.example` is safe to commit (no secrets).
- The sidecar mounts the node's RocksDB **read-only** and validates block-hash inputs (`^[a-f0-9]{64}$`) before shelling out to `ldb`.
- API routes parameterize all SQL (no string-interpolated user input); time-range / bucket values come from a fixed whitelist; faucet wallet keys are validated as 64-hex before use.
- Peer geolocation uses `ip-api.com` over plain HTTP (free tier). No node secrets are sent.
- **Before exposing beyond localhost**, change `DB_PASSWORD`, set `WALLET_KEYS`, and put the explorer behind auth/TLS.

> The app has **no built-in login**. For remote hosting — HTTPS, putting the faucet/node
> pages behind auth (or disabling them), firewalling, and protecting against remote
> reset/access — follow **[docs/SECURITY.md](docs/SECURITY.md)** and
> **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.

---

## Documentation

| Guide | What it covers |
|-------|----------------|
| [CONTRIBUTING.md](CONTRIBUTING.md) | Project layout, data flow, dev setup, coding conventions, how to report issues / send PRs |
| [docs/SECURITY.md](docs/SECURITY.md) | Threat model, what's exposed, hardening checklist, strong passwords, why "remote reset" is an SSH concern |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Remote hosting with a domain: reverse proxy + HTTPS, gating faucet/node behind a login, or disabling them entirely |
| [docs/RASPBERRY_PI.md](docs/RASPBERRY_PI.md) | Running on a Pi: hardware specs, a lighter core-only profile, step-by-step setup |

---

## Contributing

Contributions are welcome — bug reports, features, docs, dashboards. Start with
**[CONTRIBUTING.md](CONTRIBUTING.md)** for the project layout, local-dev setup, coding
conventions (including the light/dark theme rules), and the PR checklist. You don't need a
running Logos node to improve the UI, types, or docs.

---

## Troubleshooting

- **"Node API is not responding"** — the node's `:8080` API is down/unreachable; check `NODE_API` and that the node is running.
- **Empty blocks/transactions** — the indexer/sidecar are backfilling, or the node-data mount paths in `docker-compose.yml` are wrong.
- **Edits don't show up** — you're on the baked production image; use the dev override above, or rebuild `explorer`.
- **Long time-ranges (7d / 1y) look sparse** — the database only holds as much history as the node/indexer has been running.

---

## License

Provided as-is, with no warranty, for Logos testnet node operators.

Independent, community-built tool by a standalone developer — **not affiliated with, endorsed by, or maintained by the Logos / Nomos dev team.**
