# Contributing to Logos Node Dashboard

Thanks for taking the time to contribute! This guide explains how the project is laid
out, how to run it locally, and how to propose changes. If anything here is unclear,
open an issue — improving the docs is a valid contribution too.

---

## Table of contents

- [Ways to contribute](#ways-to-contribute)
- [Project layout](#project-layout)
- [How it works (data flow)](#how-it-works-data-flow)
- [Local development](#local-development)
- [Coding conventions](#coding-conventions)
- [Submitting changes](#submitting-changes)
- [Reporting bugs / requesting features](#reporting-bugs--requesting-features)
- [Good first issues](#good-first-issues)

---

## Ways to contribute

- **Report a bug** — open an issue with steps to reproduce (see the template below).
- **Suggest a feature** — open an issue describing the problem you want solved.
- **Improve docs** — README, this file, the `docs/` guides, code comments.
- **Send a pull request** — bug fixes, new explorer panels, API endpoints, indexer
  metrics, Grafana dashboards.

You do **not** need a running Logos node to improve the UI, types, docs, or to fix
lint/type errors — the app runs (with empty data) without one.

---

## Project layout

```
logos-node-dashboard/
├── app/                       # Next.js 14 explorer (App Router, TypeScript, Tailwind)
│   ├── src/app/               # pages (route folders) + /api route handlers
│   │   ├── page.tsx           #   /            home
│   │   ├── blocks/            #   /blocks      block list + live slot strip + [height] detail
│   │   ├── transactions/      #   /transactions decoded txs + [hash] detail
│   │   ├── peers/             #   /peers       rotating globe + leaderboards + peer table
│   │   ├── node/              #   /node        sync ring, health, charts, wallets
│   │   ├── faucet/            #   /faucet      server-side faucet runner + graphs
│   │   ├── apis/              #   /apis        API reference page
│   │   ├── api/               #   /api/*       all backend route handlers (SQL + node calls)
│   │   └── globals.css        #   theme variables + light-mode overrides
│   ├── src/components/        # TopNav, PeerWorldMap, Chart/MultiChart, InfoTip, SlotStrip…
│   ├── src/lib/               # db client, node client, tx decoder, ranges, theme hook, types
│   └── Dockerfile             # multi-stage production build (Next standalone output)
├── indexer/                   # Python indexer: polls node API → writes to TimescaleDB
│   └── init.sql               # database schema (blocks, peers, *_snapshots, faucet_*)
├── sidecar/                   # Python sidecar: reads node RocksDB via `ldb` (read-only)
├── prometheus/                # scrape config
├── docker-compose.yml         # full stack
├── docker-compose.dev.yml     # explorer hot-reload override
├── docs/                      # DEPLOYMENT, SECURITY, RASPBERRY_PI guides
├── .env.example               # copy to .env
└── start.sh / stop.sh / upgrade.sh / reset.sh
```

---

## How it works (data flow)

```
Logos node ──HTTP /cryptarchia, /storage────────────────┐
   │                                                     │
   │ (RocksDB on disk, read-only mount)                  ▼
   ▼                                          ┌────────────────────────┐
sidecar (:8081)  ──parsed block content──▶    │  Next.js explorer      │
   ▲                                          │  • pages (RSC + client)│
   │                                          │  • /api/* route handlers│──SQL──▶ TimescaleDB
indexer ──polls node API, geolocates peers──▶ TimescaleDB  ◀───────────┘
                                              └────────────────────────┘
Host metrics:  node-exporter ──▶ Prometheus ──▶ explorer (VM panel)
```

1. **indexer** polls the node's HTTP API every few seconds and writes blocks, peers,
   and periodic snapshots into **TimescaleDB**. It also geolocates peers via `ip-api.com`.
2. **sidecar** reads the node's RocksDB directly (read-only) so the explorer can show
   raw/decoded block content the API doesn't expose.
3. The **explorer's `/api/*` handlers** read TimescaleDB (parameterized SQL) and call the
   node / sidecar, then the pages render the result. Transaction decoding uses the node's
   `POST /storage/block` endpoint (`src/lib/tx.ts`).

A more detailed architecture diagram lives in the [README](README.md#architecture).

---

## Local development

### With Docker (recommended — matches production)

```bash
cp .env.example .env                    # edit values
# point the node-data mount paths in docker-compose.yml at your node

# hot-reload dev server (code edits appear instantly):
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d explorer

# the rest of the stack:
docker compose up -d
```

> The production `explorer` image is **baked at build time**. If you edit code while
> running the plain `docker compose up`, you must rebuild (`docker compose up -d --build
> explorer`) **or** use the dev override above for hot-reload.

### App only (no node / DB)

```bash
cd app
npm install
npm run dev        # http://localhost:3000  (data panels will be empty without the stack)
```

### Before you push — quality gates

```bash
cd app
npx tsc --noEmit       # type-check (must pass)
npx next lint          # lint
npm run build          # production build must succeed
```

CI / reviewers expect all three to pass.

---

## Coding conventions

- **TypeScript, strict.** No `any` in new code where a real type is reasonable.
- **Match the surrounding style** — naming, comment density, and idioms already in the file.
- **Theme-safe colors.** The app supports light + dark via `data-theme` on `<html>`.
  - Prefer the CSS variables / semantic classes (`text-muted`, `bg-surface`, `.glass`, `.stat-card`).
  - If you hardcode a Tailwind color (`text-white`, `bg-black`, `text-zinc-500`…), make sure
    it has a `[data-theme="light"]` override in `globals.css`, or it will break light mode.
  - For **SVG/canvas** (charts, globe) CSS overrides don't apply — use the `useIsLight()` /
    `chartColor()` helpers in `src/lib/useTheme.ts`.
- **SQL is always parameterized.** Never string-interpolate user input. Time-range and
  bucket values come from the whitelist in `src/lib/ranges.ts`.
- **Keep secrets out of git.** Use `.env` (gitignored); never commit keys or passwords.
- Run `npx tsc --noEmit` before every commit.

---

## Submitting changes

1. Fork the repo and create a branch: `git checkout -b fix/short-description`.
2. Make focused commits with clear messages (imperative mood: "Fix peer table sort").
3. Ensure `tsc`, `lint`, and `build` pass.
4. Push and open a pull request describing:
   - **What** changed and **why**.
   - How you tested it (screenshots for UI changes, light **and** dark mode).
   - Any related issue (`Fixes #123`).
5. Keep PRs small and reviewable. Large refactors: open an issue first to discuss.

---

## Reporting bugs / requesting features

Open a GitHub issue. A good bug report includes:

```
**Describe the bug**
A clear description of what's wrong.

**To reproduce**
1. Go to '...'
2. Click '...'
3. See error

**Expected behavior**
What you expected instead.

**Environment**
- OS / arch (e.g. macOS arm64, Raspberry Pi OS arm64):
- Docker / Compose version:
- Browser + theme (light/dark):
- Logos node version (if relevant):

**Screenshots / logs**
`docker compose logs explorer indexer sidecar` output if relevant.
```

For features, describe the **problem** first, then your proposed solution.

---

## Good first issues

Areas that are friendly to new contributors:

- Light/dark-mode color polish (find a panel that reads poorly and fix the override).
- Mobile/tablet responsive tweaks.
- New `InfoTip` explanations for terms that aren't yet documented.
- Additional `/api/*` filters or a new Grafana panel.
- Docs: clarify a setup step that tripped you up.

Look for issues labeled `good first issue` / `help wanted`.
