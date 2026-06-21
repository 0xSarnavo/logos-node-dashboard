import { NextRequest, NextResponse } from "next/server";
import { fetchNode } from "@/lib/node";
import pool from "@/lib/db";

export const dynamic = "force-dynamic";

const FAUCET_URL = "https://testnet.blockchain.logos.co/web/faucet-backend";
const KNOWN_KEYS = [
  "5279d197c8a0a06fdb6a73a2e66cdd81cc206067ae5b852e784bbd6127441607",
  "3b2e4ffbf402033542153420f04cbee61f27187437801bb08850bd22d540061c",
];

// POST /api/faucet — single drip, logged to DB
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const key = body.key || KNOWN_KEYS[0];
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

    // Get current balance
    let balance: number | null = null;
    if (isNew) {
      try {
        const walletData = await fetchNode<any>(`wallet/${key}/balance`);
        balance = walletData?.balance ?? null;
      } catch {}
    }

    // Store in DB
    try {
      await pool.query(
        `INSERT INTO faucet_logs (session_id, wallet_key, status_code, tx_hash, is_new_grant, amount, balance_after, error)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [sessionId, key, status, data.hash || null, isNew, isNew ? 1000 : 0, balance, data.error || null]
      );

      // Update session stats
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

      // Store balance snapshot if new grant
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
      key_short: key.slice(0, 8) + "…" + key.slice(-4),
      balance, amount: isNew ? 1000 : 0,
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json({ status: 0, error: e.message, success: false }, { status: 500 });
  }
}

// GET /api/faucet — balances + session history
export async function GET(req: NextRequest) {
  try {
    const balances = await Promise.all(
      KNOWN_KEYS.map(async (key) => {
        const data = await fetchNode<any>(`wallet/${key}/balance`);
        return {
          key, short: key.slice(0, 8) + "…" + key.slice(-4),
          balance: data?.balance ?? null,
          notes: data?.notes ? Object.keys(data.notes).length : 0,
        };
      })
    );

    // Past sessions
    const sessions = await pool.query(
      `SELECT * FROM faucet_sessions ORDER BY started_at DESC LIMIT 20`
    );

    // Lifetime stats
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
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// PUT /api/faucet — start/stop session
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();

    if (body.action === "start") {
      const res = await pool.query(
        `INSERT INTO faucet_sessions (gap_seconds, max_grants, keys)
         VALUES ($1, $2, $3) RETURNING id`,
        [body.gap || 12, body.max_grants || 0, body.keys || KNOWN_KEYS]
      );

      // Snapshot starting balances
      for (const key of (body.keys || KNOWN_KEYS)) {
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
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
