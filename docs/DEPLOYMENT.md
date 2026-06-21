# Deployment & Remote Access

How to run the dashboard beyond your own laptop: on a server with a domain, behind HTTPS,
with authentication, and with the faucet/node pages either **locked behind a login** or
**disabled entirely**.

Read **[SECURITY.md](SECURITY.md)** first — it explains *why* each step matters.

- [Scenario 1 — Local only (default)](#scenario-1--local-only-default)
- [Scenario 2 — Remote, full site behind a login](#scenario-2--remote-full-site-behind-a-login)
- [Scenario 3 — Public explorer, faucet & node operator-only](#scenario-3--public-explorer-faucet--node-operator-only)
- [Scenario 4 — Disable faucet and/or node completely](#scenario-4--disable-faucet-andor-node-completely)
- [nginx alternative](#nginx-alternative)
- [Updates, logs, backups](#updates-logs-backups)
- [Raspberry Pi](#raspberry-pi)

---

## Scenario 1 — Local only (default)

Nothing to do. Every port binds to `127.0.0.1`. Reach it at `http://localhost:3333`.
To view it from another device on the same LAN **without** exposing it publicly, use an SSH
tunnel instead of changing bindings:

```bash
ssh -L 3333:127.0.0.1:3333 user@server-ip
# now open http://localhost:3333 on your local machine
```

---

## Scenario 2 — Remote, full site behind a login

A VPS (or home server) with a domain, HTTPS, and one Basic Auth login for the whole site.
This is the simplest secure remote setup.

### Prerequisites
- A server (any small VPS, or a Raspberry Pi — see below) with Docker + Compose.
- A domain/subdomain (e.g. `logos.example.com`) with an **A record** → your server's IP.
- Ports **80** and **443** reachable; everything else firewalled (see SECURITY.md).

### Steps

1. **Install the stack** as usual (`cp .env.example .env`, edit mounts, set a real
   `DB_PASSWORD` and `GRAFANA_ADMIN_PASSWORD`), then `docker compose up -d --build`.
   Keep the explorer on `127.0.0.1:3333` — do **not** change its binding.

2. **Install [Caddy](https://caddyserver.com/docs/install)** (it does automatic HTTPS).

3. **Generate a password hash** (never store plaintext):
   ```bash
   caddy hash-password --plaintext 'your-strong-password'
   # → $2a$14$....   (copy this)
   ```

4. **Create `/etc/caddy/Caddyfile`:**
   ```caddyfile
   logos.example.com {
       encode gzip

       basicauth {
           admin $2a$14$REPLACE_WITH_YOUR_HASH
       }

       reverse_proxy 127.0.0.1:3333
   }
   ```

5. **Start Caddy:** `sudo systemctl reload caddy` (or `caddy run` to test).
   Caddy fetches a Let's Encrypt cert automatically. Visit `https://logos.example.com` —
   you'll get a login prompt, then the dashboard.

> Result: the whole dashboard — including the faucet — is reachable only after login, over
> HTTPS. This is the recommended default for a personal remote deployment.

---

## Scenario 3 — Public explorer, faucet & node operator-only

Keep the read-only explorer public, but require a login for the sensitive pages
(`/faucet`, `/node`) **and their APIs** (blocking the page without the API is pointless —
the faucet runs server-side).

```caddyfile
logos.example.com {
    encode gzip

    # Pages + APIs that only the operator should reach
    @operator {
        path /faucet*
        path /node*
        path /api/faucet*
        path /api/node*
    }
    basicauth @operator {
        admin $2a$14$REPLACE_WITH_YOUR_HASH
    }

    reverse_proxy 127.0.0.1:3333
}
```

Everything else (`/`, `/blocks`, `/transactions`, `/peers`, their read-only APIs) stays
public; the four protected prefixes prompt for a login.

> **Hiding vs. blocking:** the nav links to Faucet/My Node will still *show* for public
> users; clicking them triggers the login prompt. To also hide the links, remove or
> conditionally render them in `app/src/components/TopNav.tsx` (cosmetic — the auth above is
> what actually protects them).

---

## Scenario 4 — Disable faucet and/or node completely

If you never want the faucet (or node page) reachable on this deployment, **block the paths
at the proxy** so the server-side routes can't be hit at all:

```caddyfile
logos.example.com {
    encode gzip

    @blocked {
        path /faucet*
        path /api/faucet*      # the server-side faucet runner — the important one
        # add /node* and /api/node* here too if you also want to hide the node page
    }
    respond @blocked 404

    reverse_proxy 127.0.0.1:3333
}
```

To also drop the nav entry, remove the `Faucet` (and/or `My Node`) link in
`app/src/components/TopNav.tsx` and rebuild the explorer:

```bash
docker compose up -d --build explorer
```

> The faucet only ever acts on the keys in `WALLET_KEYS`. The simplest way to neuter it
> regardless of the UI is to **leave `WALLET_KEYS` unset** — with no keys, there's nothing
> to spend. Blocking the paths above is belt-and-suspenders.

---

## nginx alternative

If you prefer nginx + certbot:

```bash
sudo apt install nginx apache2-utils certbot python3-certbot-nginx
sudo htpasswd -cB /etc/nginx/.htpasswd admin     # creates user:hash
```

```nginx
# /etc/nginx/sites-available/logos
server {
    server_name logos.example.com;

    # Whole-site auth (Scenario 2). For Scenario 3, move these two lines
    # into a `location ~ ^/(faucet|node|api/faucet|api/node) { ... }` block.
    auth_basic "Restricted";
    auth_basic_user_file /etc/nginx/.htpasswd;

    location / {
        proxy_pass http://127.0.0.1:3333;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/logos /etc/nginx/sites-enabled/
sudo certbot --nginx -d logos.example.com     # provisions HTTPS
sudo nginx -t && sudo systemctl reload nginx
```

---

## Updates, logs, backups

```bash
./upgrade.sh                       # pull/rebuild, rolling restart, no data loss
docker compose logs -f explorer    # tail a service
docker compose ps                  # verify ports are still 127.0.0.1:*

# back up the blockchain/analytics history (TimescaleDB volume)
docker run --rm -v logos-node-dashboard_timescale-data:/data -v "$PWD":/backup \
  alpine tar czf /backup/timescale-backup.tar.gz -C /data .
```

---

## Raspberry Pi

Running on a Pi is fully supported — see **[RASPBERRY_PI.md](RASPBERRY_PI.md)** for specs,
a lighter "core-only" profile, and step-by-step setup.
