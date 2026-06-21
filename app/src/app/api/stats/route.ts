import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { fetchNode } from "@/lib/node";
import { WALLET_KEYS } from "@/lib/wallets";
import { apiError } from "@/lib/api";

export const dynamic = "force-dynamic";

const GENESIS_TS = 1776093586;
const SLOT_DURATION = 1.0;

export async function GET() {
  try {
    const [nodeInfo, dbStats, peerStats, uptimeRes, walletResults] =
      await Promise.all([
        fetchNode<any>("cryptarchia/info"),
        pool.query(`
        SELECT
          (SELECT COUNT(*) FROM blocks) AS total_blocks,
          (SELECT COUNT(*) FROM block_events) AS total_events,
          (SELECT COUNT(*) FROM block_events WHERE ts > NOW() - INTERVAL '1 hour') AS blocks_1h,
          (SELECT COUNT(*) FROM block_events WHERE ts > NOW() - INTERVAL '6 hours') AS blocks_6h,
          (SELECT COUNT(*) FROM block_events WHERE ts > NOW() - INTERVAL '24 hours') AS blocks_24h,
          (SELECT COALESCE(AVG(block_time_ms), 0) FROM block_events WHERE ts > NOW() - INTERVAL '1 hour') AS avg_bt_1h,
          (SELECT COALESCE(MIN(block_time_ms), 0) FROM block_events WHERE ts > NOW() - INTERVAL '1 hour') AS min_bt_1h,
          (SELECT COALESCE(MAX(block_time_ms), 0) FROM block_events WHERE ts > NOW() - INTERVAL '1 hour') AS max_bt_1h,
          (SELECT COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY block_time_ms), 0)
           FROM block_events WHERE ts > NOW() - INTERVAL '1 hour') AS median_bt_1h,
          (SELECT COALESCE(AVG(slot - lib_slot), 0)
           FROM consensus_snapshots WHERE ts > NOW() - INTERVAL '1 hour') AS avg_finality_lag_1h
      `),
        pool.query(`
        SELECT
          (SELECT COUNT(*) FROM peers) AS total_peers,
          (SELECT COUNT(DISTINCT country) FROM peers WHERE country IS NOT NULL) AS country_count,
          (SELECT COUNT(*) FROM peers WHERE is_bootstrap = TRUE) AS bootstrap_count
      `),
        pool.query(
          `SELECT MIN(ts) AS oldest FROM consensus_snapshots`
        ),
        Promise.all(
          WALLET_KEYS.map((key) => fetchNode<any>(`wallet/${key}/balance`))
        ),
      ]);

    const s = dbStats.rows[0];
    const p = peerStats.rows[0];

    const totalBalance = walletResults.reduce(
      (sum, w) => sum + (w?.balance ?? 0),
      0
    );

    const oldestTs = uptimeRes.rows[0]?.oldest;
    const uptimeSeconds = oldestTs
      ? Math.floor((Date.now() - new Date(oldestTs).getTime()) / 1000)
      : 0;

    const totalBlocks = parseInt(s.total_blocks);
    const uptimeMinutes = Math.max(1, uptimeSeconds / 60);
    const chainGrowthRate =
      Math.round((totalBlocks / uptimeMinutes) * 100) / 100;

    const nodeSlot = nodeInfo?.slot ?? 0;
    const liveSlot = Math.floor(
      (Date.now() / 1000 - GENESIS_TS) / SLOT_DURATION
    );

    return NextResponse.json({
      blocks: {
        total_indexed: totalBlocks,
        total_events: parseInt(s.total_events),
        per_hour: {
          last_1h: parseInt(s.blocks_1h),
          last_6h: parseInt(s.blocks_6h),
          last_24h: parseInt(s.blocks_24h),
        },
      },
      block_time: {
        avg_ms: Math.round(parseFloat(s.avg_bt_1h)),
        min_ms: Math.round(parseFloat(s.min_bt_1h)),
        max_ms: Math.round(parseFloat(s.max_bt_1h)),
        median_ms: Math.round(parseFloat(s.median_bt_1h)),
        avg_seconds:
          Math.round((parseFloat(s.avg_bt_1h) / 1000) * 10) / 10,
      },
      finality: {
        avg_lag_slots: Math.round(parseFloat(s.avg_finality_lag_1h)),
      },
      peers: {
        total: parseInt(p.total_peers),
        countries: parseInt(p.country_count),
        bootstrap: parseInt(p.bootstrap_count),
      },
      wallet: {
        total_balance: totalBalance,
        keys_tracked: WALLET_KEYS.length,
      },
      uptime: {
        tracking_since: oldestTs,
        seconds: uptimeSeconds,
        human: formatDuration(uptimeSeconds),
      },
      chain: {
        growth_rate_per_minute: chainGrowthRate,
        current_slot: nodeSlot,
        live_slot: liveSlot,
        height: nodeInfo?.height ?? 0,
      },
    });
  } catch (e) {
    return apiError(e);
  }
}

function formatDuration(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  return parts.join(" ") || "< 1m";
}
