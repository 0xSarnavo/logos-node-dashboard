import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { fetchNode } from "@/lib/node";
import { WALLET_KEYS, shortKey } from "@/lib/wallets";
import { apiError } from "@/lib/api";

export const dynamic = "force-dynamic";

const GENESIS_TS = 1776093586;
const SLOT_DURATION = 1.0;

export async function GET() {
  try {
    const [nodeInfo, networkInfo, dbStats, latestBlock, walletResults] =
      await Promise.all([
        fetchNode<any>("cryptarchia/info"),
        fetchNode<any>("network/info"),
        pool.query(`
        SELECT
          (SELECT COUNT(*) FROM blocks) AS total_blocks,
          (SELECT COUNT(*) FROM block_events) AS total_events,
          (SELECT COALESCE(AVG(block_time_ms), 0) FROM block_events WHERE ts > NOW() - INTERVAL '1 hour') AS avg_bt_1h,
          (SELECT COALESCE(AVG(slot - lib_slot), 0) FROM consensus_snapshots WHERE ts > NOW() - INTERVAL '30 minutes') AS avg_finality_lag,
          (SELECT COUNT(*) FROM peers) AS total_peers,
          (SELECT COUNT(*) FROM peers WHERE lat IS NOT NULL) AS geolocated_peers,
          (SELECT COUNT(*) FROM block_events WHERE ts > NOW() - INTERVAL '1 hour') AS blocks_1h,
          (SELECT MIN(ts) FROM consensus_snapshots) AS tracking_since
      `),
        pool.query(
          `SELECT b.height, b.block_hash, b.ts, be.block_time_ms
         FROM blocks b LEFT JOIN block_events be ON b.height = be.height
         ORDER BY b.height DESC LIMIT 1`
        ),
        Promise.all(
          WALLET_KEYS.map(async (key) => {
            const data = await fetchNode<any>(`wallet/${key}/balance`);
            return {
              key,
              balance: data?.balance ?? 0,
              notes: data?.notes ? Object.keys(data.notes).length : 0,
              reachable: data !== null,
            };
          })
        ),
      ]);

    const s = dbStats.rows[0];
    const lb = latestBlock.rows[0];

    const nodeSlot = nodeInfo?.slot ?? 0;
    const liveSlot = Math.floor(
      (Date.now() / 1000 - GENESIS_TS) / SLOT_DURATION
    );
    const chainAgeSec = Math.floor(Date.now() / 1000 - GENESIS_TS);
    const totalBlocks = parseInt(s.total_blocks);
    const totalSlots = liveSlot;
    const fillRate =
      totalSlots > 0
        ? Math.round((totalBlocks / totalSlots) * 10000) / 100
        : 0;

    // Network health score (0-100)
    const peers = networkInfo?.n_peers ?? 0;
    const fLag = parseFloat(s.avg_finality_lag) || 0;
    const blocks1h = parseInt(s.blocks_1h);

    let score = 100;
    // Peer penalty: < 3 peers = -30, < 5 = -15, < 10 = -5
    if (peers < 3) score -= 30;
    else if (peers < 5) score -= 15;
    else if (peers < 10) score -= 5;
    // Finality lag penalty: > 100 = -25, > 50 = -15, > 20 = -5
    if (fLag > 100) score -= 25;
    else if (fLag > 50) score -= 15;
    else if (fLag > 20) score -= 5;
    // Block production penalty: 0 blocks in 1h = -30, < 10 = -15
    if (blocks1h === 0) score -= 30;
    else if (blocks1h < 10) score -= 15;
    // Node unreachable = big penalty
    if (!nodeInfo) score -= 25;

    score = Math.max(0, Math.min(100, score));

    const totalBalance = walletResults.reduce(
      (sum, w) => sum + w.balance,
      0
    );
    const totalNotes = walletResults.reduce(
      (sum, w) => sum + w.notes,
      0
    );

    return NextResponse.json({
      chain: {
        age_seconds: chainAgeSec,
        age_human: formatDuration(chainAgeSec),
        genesis_timestamp: GENESIS_TS,
        total_slots: totalSlots,
        fill_rate_percent: fillRate,
        height: nodeInfo?.height ?? 0,
        slot: nodeSlot,
        lib_slot: nodeInfo?.lib_slot ?? 0,
        mode: nodeInfo?.mode ?? "Unknown",
        finality_lag: nodeSlot - (nodeInfo?.lib_slot ?? 0),
      },
      health: {
        score,
        label: score >= 80 ? "Good" : score >= 50 ? "Fair" : "Poor",
        factors: {
          peers,
          finality_lag: Math.round(fLag),
          blocks_1h: blocks1h,
          node_reachable: nodeInfo !== null,
        },
      },
      wallet: {
        total_balance: totalBalance,
        total_notes: totalNotes,
        wallets: walletResults.map((w) => ({
          address: w.key,
          short: shortKey(w.key),
          balance: w.balance,
          notes: w.notes,
          reachable: w.reachable,
        })),
      },
      latest_block: lb
        ? {
            height: lb.height,
            hash: lb.block_hash,
            timestamp: lb.ts,
            block_time_ms: lb.block_time_ms
              ? parseInt(lb.block_time_ms)
              : null,
          }
        : null,
      stats: {
        total_blocks: totalBlocks,
        total_events: parseInt(s.total_events),
        avg_block_time_ms: Math.round(parseFloat(s.avg_bt_1h)),
        tracking_since: s.tracking_since,
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
