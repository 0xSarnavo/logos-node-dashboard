import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";

export const dynamic = "force-dynamic";

const FAUCET_URL = "https://testnet.blockchain.logos.co/web/faucet-backend";

// Background faucet worker state (server-side, survives tab close — but not a server restart).
let workerInterval: NodeJS.Timeout | null = null;
let workerSessionId: number | null = null;
let workerKeys: string[] = [];
let workerGap = 12;
let workerMaxGrants = 0;
let workerKeyIdx = 0;
let workerGrantCount = 0;
let workerLastHashes: Record<string, string> = {};
let schemaReady = false;

// Ensure newer columns exist (tables were created before latency tracking).
async function ensureSchema() {
  if (schemaReady) return;
  try {
    await pool.query("ALTER TABLE faucet_logs ADD COLUMN IF NOT EXISTS latency_ms INT");
    schemaReady = true;
  } catch {}
}

async function dripOnce(key: string, sessionId: number) {
  const t0 = Date.now();
  try {
    const res = await fetch(`${FAUCET_URL}/${key}`, {
      method: "POST",
      headers: {
        "Origin": "https://testnet.blockchain.logos.co",
        "Referer": "https://testnet.blockchain.logos.co/web/faucet/",
      },
      signal: AbortSignal.timeout(15000),
    });
    const latency = Date.now() - t0;
    const status = res.status;
    let data: any = {};
    try { data = await res.json(); } catch {}

    const isNew = status === 200 && data.hash && data.hash !== workerLastHashes[key];
    const isDup = status === 200 && !isNew;
    if (isNew) {
      workerLastHashes[key] = data.hash;
      workerGrantCount++;
    }

    // Log every call (including duplicates) so call-rate / latency graphs are complete.
    await pool.query(
      `INSERT INTO faucet_logs (session_id, wallet_key, status_code, tx_hash, is_new_grant, amount, error, latency_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [sessionId, key, status, isNew ? data.hash : null, isNew, isNew ? 1000 : 0, null, latency]
    );

    await pool.query(`
      UPDATE faucet_sessions SET
        total_calls  = total_calls  + 1,
        total_grants = total_grants + $1,
        total_dups   = total_dups   + $2,
        total_429s   = total_429s   + $3,
        total_errors = total_errors + $4,
        tokens_earned = tokens_earned + $5
      WHERE id = $6
    `, [
      isNew ? 1 : 0,
      isDup ? 1 : 0,
      status === 429 ? 1 : 0,
      (status !== 200 && status !== 429) ? 1 : 0,
      isNew ? 1000 : 0,
      sessionId,
    ]);
  } catch (e) {
    const latency = Date.now() - t0;
    try {
      await pool.query(
        `INSERT INTO faucet_logs (session_id, wallet_key, status_code, is_new_grant, amount, error, latency_ms)
         VALUES ($1, $2, 0, FALSE, 0, $3, $4)`,
        [sessionId, key, String(e), latency]
      );
      await pool.query(
        "UPDATE faucet_sessions SET total_calls = total_calls + 1, total_errors = total_errors + 1 WHERE id = $1",
        [sessionId]
      );
    } catch {}
  }
}

async function workerCycle() {
  if (!workerSessionId || workerKeys.length === 0) return;
  if (workerMaxGrants > 0 && workerGrantCount >= workerMaxGrants) {
    stopWorker();
    return;
  }
  const key = workerKeys[workerKeyIdx % workerKeys.length];
  await dripOnce(key, workerSessionId);
  workerKeyIdx++;
}

async function stopWorker() {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
  }
  if (workerSessionId) {
    await pool.query("UPDATE faucet_sessions SET ended_at = NOW(), is_active = FALSE WHERE id = $1", [workerSessionId]);
    workerSessionId = null;
  }
  workerKeys = [];
  workerGrantCount = 0;
  workerKeyIdx = 0;
  workerLastHashes = {};
}

// POST — start/stop background worker
export async function POST(req: NextRequest) {
  const body = await req.json();

  if (body.action === "start") {
    await ensureSchema();
    await stopWorker();
    // Close any orphaned sessions left active by a previous server process.
    await pool.query("UPDATE faucet_sessions SET ended_at = NOW(), is_active = FALSE WHERE is_active = TRUE");

    if (body.delete_previous) {
      await pool.query("DELETE FROM faucet_logs");
      await pool.query("DELETE FROM faucet_sessions");
    }

    // Only accept 64-hex wallet keys — they're interpolated into the outbound faucet URL,
    // so reject anything else to prevent request-forgery via crafted "keys".
    const validKeys = (Array.isArray(body.keys) ? body.keys : []).filter(
      (k: any) => typeof k === "string" && /^[a-f0-9]{64}$/i.test(k)
    );
    if (validKeys.length === 0) {
      return NextResponse.json({ error: "No valid wallet keys (expected 64-hex)" }, { status: 400 });
    }
    workerKeys = validKeys;
    workerGap = body.gap || 12;
    workerMaxGrants = body.max_grants || 0;
    workerGrantCount = 0;
    workerKeyIdx = 0;
    workerLastHashes = {};

    const res = await pool.query(
      `INSERT INTO faucet_sessions (gap_seconds, max_grants, keys) VALUES ($1, $2, $3) RETURNING id`,
      [workerGap, workerMaxGrants, workerKeys]
    );
    workerSessionId = res.rows[0].id;

    const tickMs = (workerGap * 1000) / Math.max(workerKeys.length, 1);
    workerInterval = setInterval(() => workerCycle(), tickMs);
    workerCycle();

    return NextResponse.json({ status: "started", session_id: workerSessionId, keys: workerKeys.length, gap: workerGap });
  }

  if (body.action === "stop") {
    await stopWorker();
    return NextResponse.json({ status: "stopped" });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

// GET — worker status + recent logs + per-minute series for graphs
export async function GET() {
  await ensureSchema();
  const isRunning = workerInterval !== null;

  // Show the in-memory session if running, else the most recent session (so the panel is never blank).
  let session: any = null;
  if (workerSessionId) {
    const r = await pool.query("SELECT * FROM faucet_sessions WHERE id = $1", [workerSessionId]);
    session = r.rows[0] || null;
  } else {
    const r = await pool.query("SELECT * FROM faucet_sessions ORDER BY started_at DESC LIMIT 1");
    session = r.rows[0] || null;
  }

  const sessionId = session?.id ?? null;

  const [logRes, sessRes, lifeRes, seriesRes] = await Promise.all([
    pool.query(
      `SELECT ts, wallet_key, status_code, tx_hash, is_new_grant, amount, error, latency_ms
       FROM faucet_logs ORDER BY ts DESC LIMIT 50`
    ),
    pool.query("SELECT * FROM faucet_sessions ORDER BY started_at DESC LIMIT 20"),
    pool.query(`
      SELECT COUNT(*) AS total_calls,
             COUNT(*) FILTER (WHERE is_new_grant) AS total_grants,
             COUNT(*) FILTER (WHERE status_code = 200 AND NOT is_new_grant) AS total_dups,
             COALESCE(SUM(amount), 0) AS total_tokens,
             ROUND(AVG(latency_ms)) AS avg_latency
      FROM faucet_logs
    `),
    sessionId
      ? pool.query(`
        SELECT date_trunc('minute', ts) AS bucket,
               COUNT(*) AS calls,
               COUNT(*) FILTER (WHERE is_new_grant) AS grants,
               COUNT(*) FILTER (WHERE status_code = 200 AND NOT is_new_grant) AS dups,
               COUNT(*) FILTER (WHERE status_code = 429) AS rate_limited,
               COALESCE(ROUND(AVG(latency_ms)), 0) AS avg_latency
        FROM faucet_logs WHERE session_id = $1
        GROUP BY bucket ORDER BY bucket ASC
      `, [sessionId])
      : Promise.resolve({ rows: [] as any[] }),
  ]);

  const series = seriesRes.rows.map((r: any) => ({
    time: r.bucket,
    calls: parseInt(r.calls),
    grants: parseInt(r.grants),
    dups: parseInt(r.dups),
    rate_limited: parseInt(r.rate_limited),
    latency: parseInt(r.avg_latency) || 0,
  }));

  return NextResponse.json({
    running: isRunning,
    session_id: workerSessionId,
    session,
    keys: workerKeys.map(k => k.slice(0, 8) + "…" + k.slice(-4)),
    gap: workerGap,
    max_grants: workerMaxGrants,
    grant_count: workerGrantCount,
    recent_logs: logRes.rows,
    sessions: sessRes.rows,
    lifetime: lifeRes.rows[0],
    series,
  });
}
