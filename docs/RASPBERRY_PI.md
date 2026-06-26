# Running on a Raspberry Pi

The dashboard runs on a Raspberry Pi. All the container images are multi-arch and build/run
on **64-bit ARM (`aarch64`)** — Docker auto-selects the right architecture. The main
constraints are **RAM** and **disk I/O**, not CPU — so use a 64-bit OS and an SSD, and raise
`POLL_INTERVAL` to cut idle load.

- [Hardware specs](#hardware-specs)
- [What runs, and how heavy it is](#what-runs-and-how-heavy-it-is)
- [Step-by-step setup](#step-by-step-setup)
- [Tuning & troubleshooting](#tuning--troubleshooting)

---

## Hardware specs

| | Minimum | Recommended |
|---|---|---|
| **Board** | Raspberry Pi 4 Model B | Raspberry Pi 5 |
| **RAM** | 4 GB | 8 GB |
| **OS** | Raspberry Pi OS **Lite 64-bit** or Ubuntu Server 64-bit | same |
| **Storage** | **USB 3.0 SSD** (≥ 32 GB free) | **NVMe SSD** (Pi 5 + HAT) or USB 3 SSD |
| **Power** | Official USB-C PSU | Official 27 W PSU (Pi 5) |
| **Network** | Wired Ethernet preferred | Wired Ethernet |

> **Do not run the database on a microSD card.** TimescaleDB writes constantly; an SD card
> will be slow and will wear out in weeks. Boot/run from an SSD.

> **64-bit only.** Several images don't ship 32-bit ARM builds. Confirm with `uname -m` →
> it must print `aarch64`. If it prints `armv7l`, reflash a 64-bit OS.

If the **Logos node itself** also runs on the same Pi, add its requirements on top — in that
case an 8 GB Pi 5 with NVMe is strongly recommended, or run the node and the dashboard on
two separate Pis.

---

## What runs, and how heavy it is

The default (lean) stack is six containers. Rough idle memory:

| Group | Services | Approx RAM |
|-------|----------|-----------|
| **Explorer + data pipeline** | `explorer`, `timescaledb`, `indexer`, `sidecar` | ~1–1.5 GB |
| **Host metrics** | `prometheus`, `node-exporter` | ~0.3–0.5 GB |

That's everything you get with `COMPOSE_PROFILES=` (empty) — the whole explorer UI plus the
"Host Machine (VM)" panel, which is powered by Prometheus + node-exporter. Caddy (the `public`
profile) is only for a public server with a domain and isn't needed on a Pi.

---

## Step-by-step setup

1. **Flash a 64-bit OS to your SSD** with Raspberry Pi Imager (choose *Raspberry Pi OS Lite
   (64-bit)* or *Ubuntu Server 64-bit*). In the imager's settings, enable SSH and set your
   user — then boot the Pi from the SSD.

2. **Update and install Docker:**
   ```bash
   sudo apt update && sudo apt upgrade -y
   curl -fsSL https://get.docker.com | sh
   sudo usermod -aG docker $USER
   newgrp docker                       # or log out/in
   docker compose version              # the compose plugin ships with Docker now
   uname -m                            # must say: aarch64
   ```

3. **Get the project and configure it:**
   ```bash
   git clone <this-repo>
   cd logos-node-dashboard
   cp .env.example .env
   # edit .env:
   #   DB_PASSWORD     → set a real password
   #   NODE_DIR        → path to your logos-node data dir (e.g. /home/pi/logos-node)
   #   COMPOSE_PROFILES → leave empty (lean stack — best for a Pi)
   #   POLL_INTERVAL   → set to 5 (or higher) to cut idle CPU on a Pi
   ```

4. **Start it:**
   ```bash
   docker compose up -d --build
   ```
   With `COMPOSE_PROFILES` empty this brings up the lean stack (explorer + db + indexer +
   sidecar + prometheus + node-exporter) and skips Caddy. The **first build is slow on a Pi**
   (several minutes for the Next.js image) — this is normal. Subsequent starts are fast.

5. **Open it:** on the Pi itself, `http://localhost:3333`. From another device on the same
   LAN keep it private and tunnel: `ssh -L 3333:127.0.0.1:3333 user@<pi-ip>` then browse
   `http://localhost:3333` (the explorer binds to `127.0.0.1` only).

6. **For remote/domain access**, set up a reverse proxy with HTTPS + auth — see
   **[DEPLOYMENT.md](DEPLOYMENT.md)**. Caddy runs fine on a Pi.

---

## Tuning & troubleshooting

- **Build runs out of memory / gets killed.** Increase swap, then rebuild:
  ```bash
  sudo dphys-swapfile swapoff
  sudo sed -i 's/^CONF_SWAPSIZE=.*/CONF_SWAPSIZE=2048/' /etc/dphys-swapfile
  sudo dphys-swapfile setup && sudo dphys-swapfile swapon
  ```
  Or build the `explorer` image on a faster machine and load it onto the Pi.

- **Everything is sluggish / DB slow.** You're almost certainly on a microSD — move to an
  SSD. Confirm the data volume lives on the SSD.

- **An image won't pull/build (`exec format error`).** You're on a 32-bit OS. Reflash 64-bit
  (`uname -m` must be `aarch64`).

- **Out of RAM at runtime.** Raise `POLL_INTERVAL` (5–10) in `.env`, and check usage with
  `docker stats`. If you don't need the host-metrics panel you can stop those two services:
  `docker compose stop prometheus node-exporter`.

- **High temperature / throttling.** Add a heatsink/fan; the Pi 5 especially benefits under
  a continuous DB + Node.js workload.
