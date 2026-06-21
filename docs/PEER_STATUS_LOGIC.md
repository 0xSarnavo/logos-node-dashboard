# Peer Status Logic

How the Peers page decides whether each peer is **online / inconsistent / offline**, and why
"Active now" is a separate number. This documents a deliberately careful design that works
*around* a hard limitation of the data source — read the "Assumptions & limitations" section
to understand exactly how far it can be trusted.

- Code: `app/src/app/peers/page.tsx` (status computation), `indexer/indexer.py`
  (`scrape_new_peer_ips` / `index_peers`), `app/src/app/api/peers/route.ts` (API).

---

## 1. The data you actually have

Peers are discovered by scraping IP addresses out of the **node's log files** (the node exposes
no live "connected peers" API — `/network/peers` and `/network/topology` return empty; only the
*count* `n_peers` is available via `/network/info`).

The decisive fact about those logs: **the node writes its entire known-peer set in one burst**
(on log rotation / a periodic dump), not per-peer as things happen. Each time it does, the
indexer stamps `last_seen = NOW()` on every IP in that dump (`index_peers`, incremental tailing).

Two consequences drive everything below:

1. **Every peer in the node's current set shares the same `last_seen`** — the time of the last
   dump. (You can verify: `SELECT DISTINCT last_seen FROM peers` returns one row when healthy.)
2. **A peer that leaves the node's set simply stops appearing in dumps** — so its `last_seen`
   freezes while everyone else's keeps advancing.

---

## 2. Why the naive (wall-clock) approach is wrong

The obvious status rule is `now - last_seen`:

| Time | `now - last_seen` for *every* peer | Result |
|------|-----------------------------------|--------|
| right after a dump | ~0 | all **online** |
| 30 min later (pre next dump) | ~30 min | all **inconsistent** |
| later | large | all **offline** → resets on next dump |

The status oscillates with the dump cycle, **identically for all peers**. It measures dump
timing, not peer health. This is the "everything flips yellow together" bug.

---

## 3. The rule we use: measure against the freshest dump, not the clock

Compare a peer to **the rest of the set**, not to wall-clock time.

```js
const freshest = Math.max(...all last_seen);   // timestamp of the most recent dump
const lag = (freshest - last_seen);            // how far BEHIND the current set this peer is
const age = (now - last_seen);                 // wall-clock since last seen (safety net only)
```

- **`lag` is the real signal.** In the latest dump → `lag ≈ 0`. Missed the last dump (left the
  set) → `lag ≈ one dump interval`. Gone for several dumps → large `lag`. Critically, `lag` is
  **invariant to when you look** (it's peer-vs-set), so the moment of observation no longer
  flips everyone in lockstep. `lag` is also **clock-skew-proof** — both terms are server-side
  `last_seen` values.
- **`age` is only a backstop** (next section).

Decision tree (top-down, first match wins):

```js
status =
  is_bootstrap     ? "bootstrap"      // hard-coded seed nodes — their own class
  : age > 360 min  ? "offline"        // safety net: not seen at all in 6h
  : lag <   5 min  ? "online"         // present in the latest dump → in the current set
  : lag <  90 min  ? "inconsistent"   // missed recent dumps → dropping out
  :                  "offline";       // gone for a while
```

`active = (status === "online")`.

---

## 4. Why the `age > 360 min` safety net exists

`lag` compares peers to `freshest`. But if the **node goes down or the indexer stops**, there
are no new dumps — `freshest` itself is stale, yet every peer still has `lag = 0` relative to
that stale value, so a lag-only rule would cheerfully paint a **dead network green**.

So `age` (wall-clock since last seen) is checked **first**: if even the freshest peer hasn't
been seen in 6 hours, the whole dataset is stale → everything is `offline`. The same check also
retires individual peers that have been gone 6h+. To keep this skew-proof, `now` is the
**server's** clock (`server_now` from `/api/peers`), not the browser's.

---

## 5. Worked examples

| Scenario | freshest | a peer's last_seen | lag | age | status |
|---|---|---|---|---|---|
| Healthy, 20m after a dump | 13:00 | 13:00 (in dump) | 0 | 20m | **online** |
| Peer left; 13:30 dump skipped it | 13:30 | 13:00 | 30m | — | **inconsistent** |
| Same peer, gone 2h of dumps | 15:00 | 13:00 | 120m | — | **offline** |
| Node down at 13:00, viewed 19:30 | 13:00 | 13:00 | 0 | 390m | **offline** (safety net) |

When the network is healthy the map is green; the only things that turn yellow/red are peers
that genuinely fall out of the node's set.

---

## 6. "Active now" (40) vs "tracked / online" (73)

These answer **different questions** and must not be conflated:

- **Active now = `connected_peers`** from the node API (`n_peers`). The node holds ~40 live
  **connections**. This is directly reliable — no log inference. It's what "active" means, and
  it drives the header, the "Active Now" KPI, and the health dot.
- **Tracked = 73** distinct peers the node *knows about* and we've geolocated. Their map colour
  is the per-peer status from §3 — i.e. "still in the node's latest set?", **not** "connected?".

We **cannot** identify *which* 40 of the 73 are the connected ones — the node exposes no
per-peer connection list. So we show the reliable aggregate (40) for "active," and the relative
status for the individual dots, each clearly labelled (see the InfoTips on the page).

```js
const connectedNow = data?.connected_peers ?? null;             // 40, from the node
const inSetCount    = peers.filter(p => p.status === "online").length; // in latest dump
const activeCount   = connectedNow ?? inSetCount;               // prefer the node's real number
```

---

## 7. Assumptions & limitations — is it foolproof?

It is **robust for its intended use**, but no inference from this data can be perfect. Be
honest about the boundaries:

**Sound / skew-proof**
- `lag` (the main signal) uses only server-side timestamps → independent of the viewer's clock.
- The `age` safety net uses `server_now`, so it's skew-proof too. Even if a clock were off, the
  6-hour threshold absorbs ordinary skew.
- Empty/0/null `last_seen` → `lag/age = Infinity` → `offline` (safe default).
- Empty peer set → `freshest` falls back to `now`; no crash.

**Inherent limitations (cannot be fully fixed without a better node API)**
1. **"online" ≠ "connected".** It means "in the node's latest known-peer dump." The node may
   know a peer without holding a live connection to it. That's why online (73) can exceed
   connected (40). The honest connection count is shown separately as "Active now".
2. **Per-peer connection state is unknowable.** No node endpoint lists *which* peers are
   connected, so individual dots can never be a true "connected" indicator.
3. **Threshold ↔ dump-cadence coupling.** `online < 5m`, `inconsistent < 90m`, `offline ≥ 90m`
   assume dumps land roughly every ≤ ~60 min (the observed cadence). If the node dumped much
   less often than 90 min, a still-present peer could briefly read "offline" between dumps until
   the next dump refreshes it. Tune the thresholds in `peers/page.tsx` if your node's logging
   cadence differs.
4. **One-dump flicker at rotation.** Right at a dump boundary a present peer can show one dump
   interval of `lag` for a few seconds until the new dump includes it. Self-corrects next poll.
5. **`Math.max(...lastTimes)`** spreads the array — fine for hundreds of peers; if this ever
   tracked >~100k peers, replace with a reduce to avoid call-stack limits.

**Bottom line:** the per-peer colour is a reliable *"is this peer still in the node's set?"*
signal and correctly flags peers that leave; it is **not** a per-peer "connected" truth (that
data doesn't exist). The reliable live number is **Active now (40)**, taken straight from the
node. Both are labelled so the UI never overstates what it knows.

---

## 8. If the node ever exposes live peer IPs

If a future node build returns the connected peer list (IPs) from `/network/peers` or similar,
the correct upgrade is: in `indexer.py` mark exactly those IPs as connected each poll, and base
per-peer status on real connection state instead of dump-relative `lag`. The UI would then need
no "tracked vs connected" caveat. Until then, the logic above is the most honest reading of the
available data.
