import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { resolveRange } from "@/lib/ranges";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { win, bucket } = resolveRange(req.nextUrl.searchParams.get("range"));

  try {
    const res = await pool.query(
      `SELECT
         time_bucket('${bucket}', ts) AS time,
         AVG(n_peers)::INT AS peers,
         AVG(n_connections)::INT AS connections,
         AVG(n_pending_connections)::INT AS pending
       FROM network_snapshots
       WHERE ts > NOW() - INTERVAL '${win}'
       GROUP BY time
       ORDER BY time`
    );

    return NextResponse.json(res.rows);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
