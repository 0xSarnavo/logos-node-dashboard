import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import pool from "@/lib/db";
import { fetchNode } from "@/lib/node";

export const dynamic = "force-dynamic";

// Testnet genesis: computed from current slot and time
const GENESIS = 1776093586; // 2026-04-13T15:19:46Z
const SLOT_DURATION = 1.0;

export async function GET() {
  try {
    const [nodeInfo, networkInfo, stats, slotHistory] = await Promise.all([
      fetchNode<any>("cryptarchia/info"),
      fetchNode<any>("network/info"),
      pool.query(`
        SELECT
          (SELECT COUNT(*) FROM blocks) AS total_blocks,
          (SELECT COUNT(*) FROM block_events) AS total_events,
          (SELECT COUNT(*) FROM block_events WHERE ts > NOW() - INTERVAL '1 hour') AS blocks_1h,
          (SELECT COUNT(*) FROM block_events WHERE ts > NOW() - INTERVAL '24 hours') AS blocks_24h,
          (SELECT COALESCE(AVG(block_time_ms), 0) FROM block_events WHERE ts > NOW() - INTERVAL '30 minutes') AS avg_bt_30m,
          (SELECT COALESCE(MIN(block_time_ms), 0) FROM block_events WHERE ts > NOW() - INTERVAL '1 hour') AS min_bt_1h,
          (SELECT COALESCE(MAX(block_time_ms), 0) FROM block_events WHERE ts > NOW() - INTERVAL '1 hour') AS max_bt_1h,
          (SELECT COALESCE(AVG(n_peers), 0) FROM network_snapshots WHERE ts > NOW() - INTERVAL '1 hour') AS avg_peers_1h,
          (SELECT COALESCE(MIN(n_peers), 0) FROM network_snapshots WHERE ts > NOW() - INTERVAL '1 hour') AS min_peers_1h,
          (SELECT COALESCE(MAX(n_peers), 0) FROM network_snapshots WHERE ts > NOW() - INTERVAL '1 hour') AS max_peers_1h,
          (SELECT COALESCE(AVG(n_connections), 0) FROM network_snapshots WHERE ts > NOW() - INTERVAL '1 hour') AS avg_conn_1h,
          (SELECT COALESCE(AVG(slot - lib_slot), 0) FROM consensus_snapshots WHERE ts > NOW() - INTERVAL '30 minutes') AS avg_finality_lag,
          (SELECT MIN(ts) FROM consensus_snapshots) AS tracking_since
      `),
      // Slot rate: measure slot advancement over last 60s
      pool.query(`
        SELECT slot, EXTRACT(EPOCH FROM ts) AS epoch
        FROM consensus_snapshots
        WHERE ts > NOW() - INTERVAL '70 seconds'
        ORDER BY ts ASC
        LIMIT 2
      `),
    ]);

    const s = stats.rows[0];
    const nodeSlot = nodeInfo?.slot ?? 0;
    const liveSlot = Math.floor((Date.now() / 1000 - GENESIS) / SLOT_DURATION);
    const slotsBehind = Math.max(0, liveSlot - nodeSlot);
    const syncPercent = liveSlot > 0 ? Math.min(100, (nodeSlot / liveSlot) * 100) : 0;
    const caughtUp = slotsBehind <= 120;

    // Slot rate from DB history
    let slotRate: number | null = null;
    let etaSeconds: number | null = null;
    if (slotHistory.rows.length >= 2) {
      const oldest = slotHistory.rows[0];
      const newest = slotHistory.rows[slotHistory.rows.length - 1];
      const dt = parseFloat(newest.epoch) - parseFloat(oldest.epoch);
      const ds = parseInt(newest.slot) - parseInt(oldest.slot);
      if (dt > 0) {
        slotRate = Math.round((ds / dt) * 10) / 10;
        const netClose = slotRate - 1.0; // live slot also advances 1/s
        if (slotsBehind > 120 && netClose > 0.5) {
          etaSeconds = Math.round(slotsBehind / netClose);
        }
      }
    }

    // Try to get wallet balances
    const wallets: any[] = [];
    try {
      // Read wallet keys from config if available
      const configRes = await fetchNode<any>("wallet/info");
      if (configRes) wallets.push(configRes);
    } catch {}

    return NextResponse.json({
      chain: {
        height: nodeInfo?.height ?? 0,
        slot: nodeSlot,
        lib_slot: nodeInfo?.lib_slot ?? 0,
        lib_hash: nodeInfo?.lib ?? "",
        tip_hash: nodeInfo?.tip ?? "",
        mode: nodeInfo?.mode ?? "Unknown",
        finality_lag: (nodeInfo?.slot ?? 0) - (nodeInfo?.lib_slot ?? 0),
      },
      sync: {
        live_slot: liveSlot,
        slots_behind: slotsBehind,
        seconds_behind: slotsBehind, // 1s per slot
        percent: Math.round(syncPercent * 100) / 100,
        slot_rate: slotRate,
        eta_seconds: etaSeconds,
        caught_up: caughtUp,
      },
      network: {
        peer_id: networkInfo?.peer_id ?? "",
        peers: networkInfo?.n_peers ?? 0,
        connections: networkInfo?.n_connections ?? 0,
        pending: networkInfo?.n_pending_connections ?? 0,
        listen_addresses: networkInfo?.listen_addresses ?? [],
      },
      stats: {
        total_blocks: parseInt(s.total_blocks),
        total_events: parseInt(s.total_events),
        blocks_1h: parseInt(s.blocks_1h),
        blocks_24h: parseInt(s.blocks_24h),
        avg_bt: Math.round(parseFloat(s.avg_bt_30m) / 100) / 10,
        min_bt: Math.round(parseFloat(s.min_bt_1h) / 100) / 10,
        max_bt: Math.round(parseFloat(s.max_bt_1h) / 100) / 10,
        avg_peers: Math.round(parseFloat(s.avg_peers_1h)),
        min_peers: parseInt(s.min_peers_1h),
        max_peers: parseInt(s.max_peers_1h),
        avg_conn: Math.round(parseFloat(s.avg_conn_1h)),
        avg_finality: Math.round(parseFloat(s.avg_finality_lag)),
        tracking_since: s.tracking_since,
      },
    });
  } catch (e) {
    return apiError(e);
  }
}
