# Security & Hardening Guide

This dashboard is designed to run **locally** (single operator, `localhost` only). The
moment you expose it to a network or a domain, you become responsible for putting it
behind authentication and TLS — **the explorer has no built-in login.**

This guide explains what is and isn't exposed, the real risks when you go remote, and a
concrete hardening checklist. For the *how-to* of remote hosting (reverse proxy, HTTPS,
auth gating), see **[DEPLOYMENT.md](DEPLOYMENT.md)**.

---

## TL;DR

- **Default install = safe-ish:** every published port binds to `127.0.0.1`. Nothing is
  reachable from the network until you change that or add a proxy.
- **There is no authentication in the app.** If you expose `:3333` directly, *anyone with
  the URL* can read your node data **and operate the faucet** (which uses your wallet keys).
- **`reset.sh` / `stop.sh` are host shell scripts, not web endpoints.** A remote browser
  user can **not** reset or wipe anything — that requires shell/SSH access to the machine.
  So "remote reset" is really an **SSH** problem: lock down SSH and it can't happen.
- Before exposing: **reverse proxy + HTTPS + auth + firewall + strong passwords.**

---

## What is exposed by default

From `docker-compose.yml`, all published ports are bound to loopback:

| Service | Port | Binding | Reachable from network? |
|---------|------|---------|-------------------------|
| explorer (UI + `/api`) | 3333 | `127.0.0.1:3333` | No |
| Grafana | 3000 | `127.0.0.1:3000` | No |
| Prometheus | 9090 | `127.0.0.1:9090` | No |
| OTLP collector | 4317/4318 | `127.0.0.1:*` | No |
| TimescaleDB | 5432 | internal Docker network only | No |
| sidecar | 8081 | internal Docker network only | No |

So out of the box, you must be **on the machine** (or tunnel in) to reach anything. Good.

The risk appears only when you **(a)** change a binding to `0.0.0.0`, **(b)** put a reverse
proxy in front, or **(c)** open ports in your firewall/router — without also adding auth.

---

## Threat model when you go remote

If you expose the explorer **without** auth, an attacker who finds the URL can:

1. **Read everything the dashboard shows** — block history, peers, **your node's public IP /
   ISP / location**, wallet balances, consensus state. (Informational, but it fingerprints
   your node.)
2. **Operate the faucet.** `/faucet` + the server-side `/api/faucet/worker` run faucet
   requests using the wallet keys in `WALLET_KEYS`. A remote user could **start/stop faucet
   sessions on your behalf** and read your tracked wallet activity. This is the most
   sensitive surface — treat the faucet page as **operator-only**.
3. **Hit your Grafana/Prometheus** if you also published those.

What an attacker **cannot** do over the web:

- Run `reset.sh`, `stop.sh`, `upgrade.sh` — these are **host shell scripts**, never served
  over HTTP. There is no destructive HTTP endpoint in the app.
- Modify the node — the **sidecar mounts RocksDB read-only**, and the indexer only *reads*
  the node API.
- Reach the database — TimescaleDB has **no host port**; it's on the internal Docker network.

> The realistic path to a "remote wipe" is someone getting **SSH/shell** on the box. That's
> why SSH hardening (below) matters more than anything in the app itself.

---

## Hardening checklist

Work top-down; the first three stop the most.

### 1. Keep services on loopback; expose only the proxy
Leave the `127.0.0.1:` bindings as-is. Put a reverse proxy (Caddy/nginx) on `443` and let it
talk to `127.0.0.1:3333`. Never bind `:3333`, `:3000`, `:5432`, `:8081` to `0.0.0.0`.

### 2. Terminate TLS (HTTPS)
Use Caddy (automatic Let's Encrypt) or certbot + nginx. No plaintext HTTP for a remote host.
See [DEPLOYMENT.md](DEPLOYMENT.md).

### 3. Require authentication
At minimum HTTP Basic Auth at the proxy. For multiple users / real accounts, use
[Authelia](https://www.authelia.com/) or [oauth2-proxy](https://oauth2-proxy.github.io/).
You can gate the **whole site**, or keep a public read-only explorer and gate only
`/faucet`, `/node`, `/api/faucet*`, `/api/node*`. Steps in [DEPLOYMENT.md](DEPLOYMENT.md).

### 4. Firewall
```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp        # SSH — ideally restrict to your IP: `ufw allow from <ip> to any port 22`
sudo ufw allow 80,443/tcp    # reverse proxy
sudo ufw enable
```

### 5. Lock down SSH (this is your real "no remote reset" control)
```bash
# /etc/ssh/sshd_config
PermitRootLogin no
PasswordAuthentication no      # key-only
```
- Use SSH keys, not passwords.
- Install `fail2ban`.
- Consider a non-standard SSH port and/or restricting port 22 to your IP in `ufw`.
- Without shell access, nobody can run `reset.sh` or read your `.env`.

### 6. Strong passwords (see next section)
Grafana admin, `DB_PASSWORD`, and any proxy Basic Auth credentials.

### 7. Faucet hygiene
- Only set `WALLET_KEYS` if you actually use the faucet, and prefer **low-value testnet
  keys**. Never put mainnet/high-value keys here.
- Put `/faucet` and `/api/faucet*` behind auth (or block them — see DEPLOYMENT) on any
  remote deployment.

### 8. Keep secrets in `.env` only
`.env` is gitignored; `.env.example` carries no secrets. Never commit real keys/passwords.
Rotate `DB_PASSWORD` and Grafana creds away from their defaults before exposing anything.

### 9. Updates & backups
- `./upgrade.sh` pulls/rebuilds with a rolling restart (no data loss).
- Back up the `timescale-data` volume if the history matters to you.
- Keep the host OS and Docker patched.

---

## Strong passwords

Generate, don't invent:

```bash
# A long random password (use for DB_PASSWORD, Grafana admin, etc.)
openssl rand -base64 24

# A bcrypt hash for Caddy Basic Auth (don't store the plaintext in the Caddyfile)
caddy hash-password --plaintext 'your-strong-password'

# An htpasswd entry for nginx Basic Auth
htpasswd -nB admin            # prompts, prints user:hash
```

Guidance:
- **≥ 16 characters**, random, unique per service. Use a password manager.
- Change `DB_PASSWORD` from the `logos_internal_db` default before any non-local use.
- Set a real `GRAFANA_ADMIN_PASSWORD` (empty = anonymous access, fine **only** on localhost).
- Never reuse your SSH key passphrase as an app password.

---

## Quick "am I safe?" self-check

- [ ] `docker compose ps` shows ports as `127.0.0.1:…` (not `0.0.0.0:…`).
- [ ] Remote access goes through a proxy on `443` with a valid certificate.
- [ ] Visiting the site from another device **prompts for login** (or the faucet/node pages do).
- [ ] `ufw status` denies everything except 22/80/443.
- [ ] SSH is key-only, root login disabled.
- [ ] `DB_PASSWORD` and Grafana password are not the defaults.
- [ ] `WALLET_KEYS` is unset, or holds only disposable testnet keys, and `/faucet` is gated.

If every box is checked, a stranger with your URL can't read your node data, can't run the
faucet, and can't reset anything.
