import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { fetchNode } from "@/lib/node";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [nodeInfo, networkInfo, dbStats] = await Promise.all([
      fetchNode<any>("cryptarchia/info"),
      fetchNode<any>("network/info"),
      pool.query(`
        SELECT
          (SELECT COUNT(*) FROM blocks) AS total_blocks,
          (SELECT COUNT(*) FROM block_events WHERE ts > NOW() - INTERVAL '1 hour') AS blocks_1h,
          (SELECT COUNT(*) FROM block_events WHERE ts > NOW() - INTERVAL '24 hours') AS blocks_24h,
          (SELECT COALESCE(AVG(block_time_ms), 0) FROM block_events WHERE ts > NOW() - INTERVAL '30 minutes') AS avg_block_time_ms
      `),
    ]);

    const stats = dbStats.rows[0];

    // Sync calculation
    const GENESIS_TS = 1776093586; // 2026-04-13T15:19:31Z
    const SLOT_DURATION = 1.0; // seconds
    const node_slot = nodeInfo?.slot ?? 0;
    const live_slot = Math.floor((Date.now() / 1000 - GENESIS_TS) / SLOT_DURATION);
    const slots_behind = live_slot - node_slot;
    const sync_percent = Math.min(100, (node_slot / live_slot) * 100);
    const caught_up = slots_behind <= 120;

    return NextResponse.json({
      height: nodeInfo?.height ?? 0,
      slot: nodeInfo?.slot ?? 0,
      lib_slot: nodeInfo?.lib_slot ?? 0,
      lib_hash: nodeInfo?.lib ?? "",
      tip_hash: nodeInfo?.tip ?? "",
      mode: nodeInfo?.mode ?? "Unknown",
      finality_lag: (nodeInfo?.slot ?? 0) - (nodeInfo?.lib_slot ?? 0),
      peers: networkInfo?.n_peers ?? 0,
      connections: networkInfo?.n_connections ?? 0,
      pending: networkInfo?.n_pending_connections ?? 0,
      peer_id: networkInfo?.peer_id ?? "",
      listen_addresses: networkInfo?.listen_addresses ?? [],
      total_blocks: parseInt(stats.total_blocks),
      blocks_1h: parseInt(stats.blocks_1h),
      blocks_24h: parseInt(stats.blocks_24h),
      avg_block_time: Math.round(parseFloat(stats.avg_block_time_ms) / 1000 * 10) / 10,
      live_slot,
      slots_behind,
      sync_percent,
      caught_up,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
