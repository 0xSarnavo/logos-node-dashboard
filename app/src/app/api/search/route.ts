import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") || "").trim().toLowerCase();
  if (!q) return NextResponse.json({ type: "none", results: [] });

  try {
    // Pure number — try block height, then slot.
    if (/^\d+$/.test(q)) {
      const n = parseInt(q, 10);
      let res = await pool.query("SELECT height, block_hash FROM blocks WHERE height = $1 LIMIT 1", [n]);
      if (res.rows.length) return NextResponse.json({ type: "block", by: "height", results: res.rows });

      res = await pool.query("SELECT height, block_hash FROM block_content WHERE slot = $1 LIMIT 1", [n]);
      if (res.rows.length) return NextResponse.json({ type: "block", by: "slot", results: res.rows });
    }

    // Hex — block hash (partial or full).
    if (/^[a-f0-9]+$/.test(q) && q.length >= 6) {
      let res = await pool.query(
        "SELECT height, block_hash FROM block_content WHERE block_hash LIKE $1 ORDER BY height DESC LIMIT 5",
        [`${q}%`]
      );
      if (res.rows.length) return NextResponse.json({ type: "block", by: "hash", results: res.rows });

      res = await pool.query(
        "SELECT height, block_hash FROM blocks WHERE block_hash LIKE $1 ORDER BY height DESC LIMIT 5",
        [`${q}%`]
      );
      if (res.rows.length) return NextResponse.json({ type: "block", by: "hash", results: res.rows });
    }

    return NextResponse.json({ type: "none", results: [] });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
