import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { fetchNode } from "@/lib/node";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const page = parseInt(req.nextUrl.searchParams.get("page") || "1");
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") || "25"), 100);
  const offset = (page - 1) * limit;
  const timeRange = req.nextUrl.searchParams.get("range") || "";
  const status = req.nextUrl.searchParams.get("status") || "";
  const speed = req.nextUrl.searchParams.get("speed") || "";

  try {
    const nodeInfo = await fetchNode<any>("cryptarchia/info");
    const tipHeight = nodeInfo?.height ?? 0;
    const tipSlot = nodeInfo?.slot ?? 0;
    const libSlot = nodeInfo?.lib_slot ?? 0;
    const slotGap = tipSlot - libSlot;
    const estimatedLibHeight = Math.max(0, tipHeight - Math.ceil(slotGap / 18));
    const slotsPerHeight = tipHeight > 0 ? tipSlot / tipHeight : 18;

    // Build WHERE clauses
    const conditions: string[] = ["1=1"];
    const params: any[] = [];
    let paramIdx = 1;

    if (timeRange === "1h") conditions.push(`b.ts > NOW() - INTERVAL '1 hour'`);
    else if (timeRange === "6h") conditions.push(`b.ts > NOW() - INTERVAL '6 hours'`);
    else if (timeRange === "24h") conditions.push(`b.ts > NOW() - INTERVAL '24 hours'`);

    if (status === "pending") {
      conditions.push(`b.height > $${paramIdx}`);
      params.push(estimatedLibHeight);
      paramIdx++;
    } else if (status === "confirmed") {
      conditions.push(`b.height <= $${paramIdx}`);
      params.push(estimatedLibHeight);
      paramIdx++;
    }

    if (speed === "fast") conditions.push(`be.block_time_ms IS NOT NULL AND be.block_time_ms < 10000`);
    else if (speed === "slow") conditions.push(`be.block_time_ms IS NOT NULL AND be.block_time_ms >= 30000`);

    const where = conditions.join(" AND ");

    if (status === "orphaned") {
      // Override for orphaned filter
      conditions.pop(); // remove the last height condition if any
      conditions.push("b.is_orphaned = TRUE");
    }

    const where2 = conditions.join(" AND ");

    const [blocksRes, countRes] = await Promise.all([
      pool.query(
        `SELECT b.height, b.block_hash, b.ts AS indexed_at, b.is_orphaned,
                be.block_time_ms, be.ts AS produced_at,
                bc.tx_count, bc.block_size
         FROM blocks b
         LEFT JOIN block_events be ON b.height = be.height
         LEFT JOIN block_content bc ON b.block_hash = bc.block_hash
         WHERE ${where2}
         ORDER BY b.height DESC
         LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
        [...params, limit, offset]
      ),
      pool.query(
        `SELECT COUNT(*) FROM blocks b LEFT JOIN block_events be ON b.height = be.height WHERE ${where2}`,
        params
      ),
    ]);

    const blocks = blocksRes.rows.map((b: any) => {
      let blockStatus = b.height <= estimatedLibHeight ? "confirmed" : "pending";
      if (b.is_orphaned) blockStatus = "orphaned";
      return {
        height: b.height,
        block_hash: b.block_hash,
        slot: Math.round(b.height * slotsPerHeight),
        block_time_ms: b.block_time_ms ? parseInt(b.block_time_ms) : null,
        indexed_at: b.indexed_at,
        produced_at: b.produced_at,
        status: blockStatus,
        tx_count: b.tx_count ? parseInt(b.tx_count) : null,
        block_size: b.block_size ? parseInt(b.block_size) : null,
      };
    });

    return NextResponse.json({
      blocks,
      total: parseInt(countRes.rows[0].count),
      page,
      limit,
      pages: Math.ceil(parseInt(countRes.rows[0].count) / limit),
      tip_height: tipHeight,
      tip_slot: tipSlot,
      lib_height: estimatedLibHeight,
      lib_slot: libSlot,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
