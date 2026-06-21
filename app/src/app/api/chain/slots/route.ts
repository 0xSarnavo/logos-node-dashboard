import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { fetchNode } from "@/lib/node";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const baseCount = Math.min(parseInt(req.nextUrl.searchParams.get("count") || "200"), 1500);

  try {
    const nodeInfo = await fetchNode<any>("cryptarchia/info");
    const libSlot = nodeInfo?.lib_slot ?? 0;
    // Anchor the window to the latest INDEXED block (the node's live slot runs ahead of
    // what we've indexed, which would otherwise show a window full of empty slots).
    const maxRes = await pool.query("SELECT MAX(slot) AS m FROM block_content WHERE slot > 0");
    const tipSlot = parseInt(maxRes.rows[0]?.m) || nodeInfo?.slot || 0;
    // Widen the window so it reaches ~150 slots below LIB → finalized blocks are always visible,
    // however large the finality lag is (it varies a lot). `count` acts as a minimum.
    const span = libSlot > 0 && tipSlot > libSlot ? tipSlot - libSlot + 150 : baseCount;
    const winCount = Math.min(Math.max(baseCount, span), 1000);
    const startSlot = Math.max(0, tipSlot - winCount + 1);

    // Real producing slots (a slot is "filled" when a block exists at it).
    const res = await pool.query(
      `SELECT DISTINCT slot FROM block_content WHERE slot BETWEEN $1 AND $2`,
      [startSlot, tipSlot]
    );
    const blockSlots = new Set(res.rows.map((r: any) => parseInt(r.slot)));

    const slots: { slot: number; has_block: boolean; final: boolean }[] = [];
    for (let s = startSlot; s <= tipSlot; s++) {
      const has = blockSlots.has(s);
      slots.push({ slot: s, has_block: has, final: has && s <= libSlot });
    }

    const filled = slots.filter((s) => s.has_block).length;
    return NextResponse.json({
      slots,
      filled,
      total: slots.length,
      fill_rate: Math.round((filled / Math.max(1, slots.length)) * 1000) / 10,
      tip_slot: tipSlot,
      lib_slot: libSlot,
      start_slot: startSlot,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
