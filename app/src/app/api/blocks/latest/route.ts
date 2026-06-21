import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { fetchNode } from "@/lib/node";

export const dynamic = "force-dynamic";

const GENESIS_TS = 1776093586;
const SLOT_DURATION = 1.0;

export async function GET() {
  try {
    const nodeInfo = await fetchNode<any>("cryptarchia/info");
    const tipHeight = nodeInfo?.height ?? 0;
    const tipSlot = nodeInfo?.slot ?? 0;
    const libSlot = nodeInfo?.lib_slot ?? 0;
    const slotGap = tipSlot - libSlot;
    const estimatedLibHeight = Math.max(
      0,
      tipHeight - Math.ceil(slotGap / 18)
    );
    const slotsPerHeight = tipHeight > 0 ? tipSlot / tipHeight : 18;

    const blocksRes = await pool.query(`
      SELECT b.height, b.block_hash, b.ts AS indexed_at, b.is_orphaned,
             be.block_time_ms, be.ts AS produced_at
      FROM blocks b
      LEFT JOIN block_events be ON b.height = be.height
      ORDER BY b.height DESC
      LIMIT 10
    `);

    const blocks = blocksRes.rows.map((b: any) => {
      const estimatedSlot = Math.round(b.height * slotsPerHeight);
      let status = b.height <= estimatedLibHeight ? "confirmed" : "pending";
      if (b.is_orphaned) status = "orphaned";
      const confirmations = Math.max(0, tipHeight - b.height);
      const blockTimeSec = b.block_time_ms
        ? Math.round(parseInt(b.block_time_ms) / 100) / 10
        : null;

      return {
        height: b.height,
        block_hash: b.block_hash,
        estimated_slot: estimatedSlot,
        status,
        block_time_ms: b.block_time_ms ? parseInt(b.block_time_ms) : null,
        block_time_seconds: blockTimeSec,
        indexed_at: b.indexed_at,
        produced_at: b.produced_at,
        confirmations,
        is_orphaned: b.is_orphaned ?? false,
      };
    });

    return NextResponse.json({
      blocks,
      tip_height: tipHeight,
      tip_slot: tipSlot,
      lib_slot: libSlot,
      estimated_lib_height: estimatedLibHeight,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
