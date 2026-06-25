import { NextRequest, NextResponse } from "next/server";
import { fetchNode } from "@/lib/node";
import pool from "@/lib/db";
import { WALLET_KEYS, shortKey, isValidKey } from "@/lib/wallets";
import { apiError, faucetEnabled, faucetDisabled } from "@/lib/api";
import { readAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

const FAUCET_URL = "https://testnet.blockchain.logos.co/web/faucet-backend";

// POST /api/faucet — single drip, logged to DB
export async function POST(req: NextRequest) {
  if (!faucetEnabled()) return faucetDisabled();
  try {
    const body = await req.json().catch(() => ({}));
    const key = body.key ?? WALLET_KEYS[0];
    // The key is interpolated into outbound URLs — reject anything that isn't 64-hex (SEC-1).
    if (!isValidKey(key)) {
      return NextResponse.json({ error: "Invalid wallet key" }, { status: 400 });
    }
    const sessionId = body.session_id || null;

    const res = await fetch(`${FAUCET_URL}/${key}`, {
      method: "POST",
      headers: {
        "Origin": "https://testnet.blockchain.logos.co",
        "Referer": "https://testnet.blockchain.logos.co/web/faucet/",
      },
      signal: AbortSignal.timeout(15000),
    });

    const status = res.status;
    let data: any = {};
    try { data = await res.json(); } catch {}

    const isNew = status === 200 && !!data.hash;

    let balance: number | null = null;
    if (isNew) {
      try {
        const walletData = await fetchNode<any>(`wallet/${key}/balance`);
        balance = walletData?.balance ?? null;
      } catch {}
    }

    try {
      await pool.query(
        `INSERT INTO faucet_logs (session_id, wallet_key, status_code, tx_hash, is_new_grant, amount, balance_after, error)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [sessionId, key, status, data.hash || null, isNew, isNew ? 1000 : 0, balance, data.error || null]
      );

      if (sessionId) {
        await pool.query(`
          UPDATE faucet_sessions SET
            total_calls = total_calls + 1,
            total_grants = total_grants + $1,
            total_dups = total_dups + $2,
            total_429s = total_429s + $3,
            total_errors = total_errors + $4,
            tokens_earned = tokens_earned + $5
          WHERE id = $6
        `, [
          isNew ? 1 : 0,
          (status === 200 && !isNew) ? 1 : 0,
          status === 429 ? 1 : 0,
          (status !== 200 && status !== 429) ? 1 : 0,
          isNew ? 1000 : 0,
          sessionId,
        ]);
      }

      if (isNew && balance !== null) {
        await pool.query(
          "INSERT INTO faucet_balances (wallet_key, balance) VALUES ($1, $2)",
          [key, balance]
        );
      }
    } catch (e) {
      console.error("faucet log error:", e);
    }

    return NextResponse.json({
      status, hash: data.hash || null, success: isNew,
      key_short: shortKey(key),
      balance, amount: isNew ? 1000 : 0,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    return apiError(e);
  }
}

// GET /api/faucet — balances + session history
export async function GET() {
  if (!(await readAuth()).authed) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const balances = await Promise.all(
      WALLET_KEYS.map(async (key) => {
        const data = await fetchNode<any>(`wallet/${key}/balance`);
        return {
          key, short: shortKey(key),
          balance: data?.balance ?? null,
          notes: data?.notes ? Object.keys(data.notes).length : 0,
        };
      })
    );

    const sessions = await pool.query(
      `SELECT * FROM faucet_sessions ORDER BY started_at DESC LIMIT 20`
    );

    const lifetime = await pool.query(`
      SELECT
        COUNT(*) as total_calls,
        COUNT(*) FILTER (WHERE is_new_grant) as total_grants,
        COALESCE(SUM(amount), 0) as total_tokens,
        MIN(ts) as first_drip,
        MAX(ts) as last_drip
      FROM faucet_logs
    `);

    return NextResponse.json({
      keys: balances,
      total_balance: balances.reduce((s, b) => s + (b.balance ?? 0), 0),
      grant_amount: 1000,
      sessions: sessions.rows,
      lifetime: lifetime.rows[0],
    });
  } catch (e) {
    return apiError(e);
  }
}

// PUT /api/faucet — start/stop session
export async function PUT(req: NextRequest) {
  if (!faucetEnabled()) return faucetDisabled();
  try {
    const body = await req.json();

    if (body.action === "start") {
      const keys: string[] = (Array.isArray(body.keys) && body.keys.length) ? body.keys : WALLET_KEYS;
      // All keys are interpolated into outbound faucet/node URLs — reject any non-64-hex (SEC-5).
      if (!keys.every(isValidKey)) {
        return NextResponse.json({ error: "Invalid wallet key in keys[]" }, { status: 400 });
      }
      const res = await pool.query(
        `INSERT INTO faucet_sessions (gap_seconds, max_grants, keys)
         VALUES ($1, $2, $3) RETURNING id`,
        [body.gap || 12, body.max_grants || 0, keys]
      );

      for (const key of keys) {
        const data = await fetchNode<any>(`wallet/${key}/balance`);
        if (data?.balance != null) {
          await pool.query(
            "INSERT INTO faucet_balances (wallet_key, balance, notes) VALUES ($1, $2, $3)",
            [key, data.balance, data.notes ? Object.keys(data.notes).length : 0]
          );
        }
      }

      return NextResponse.json({ session_id: res.rows[0].id });
    }

    if (body.action === "stop" && body.session_id) {
      await pool.query(
        "UPDATE faucet_sessions SET ended_at = NOW(), is_active = FALSE WHERE id = $1",
        [body.session_id]
      );
      return NextResponse.json({ stopped: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (e) {
    return apiError(e);
  }
}
