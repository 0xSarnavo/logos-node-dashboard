import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import pool from "@/lib/db";
import { resolveRange } from "@/lib/ranges";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const metric = req.nextUrl.searchParams.get("metric") || "height";
  const { win, bucket } = resolveRange(req.nextUrl.searchParams.get("range"));

  try {
    let query: string;

    switch (metric) {
      case "height":
        query = `SELECT time_bucket('${bucket}', ts) AS time, MAX(block_height) AS value
                 FROM consensus_snapshots WHERE ts > NOW() - INTERVAL '${win}'
                 GROUP BY time ORDER BY time`;
        break;
      case "block_time":
        query = `SELECT time_bucket('${bucket}', ts) AS time, ROUND(AVG(block_time_ms) / 1000.0, 1) AS value
                 FROM block_events WHERE ts > NOW() - INTERVAL '${win}'
                 GROUP BY time ORDER BY time`;
        break;
      case "finality":
        query = `SELECT time_bucket('${bucket}', ts) AS time, AVG(slot - lib_slot)::INT AS value
                 FROM consensus_snapshots WHERE ts > NOW() - INTERVAL '${win}'
                 GROUP BY time ORDER BY time`;
        break;
      case "blocks_per_5m":
        query = `SELECT time_bucket('${bucket}', ts) AS time, COUNT(*) AS value
                 FROM block_events WHERE ts > NOW() - INTERVAL '${win}'
                 GROUP BY time ORDER BY time`;
        break;
      default:
        return NextResponse.json({ error: "Unknown metric" }, { status: 400 });
    }

    const res = await pool.query(query);
    return NextResponse.json(res.rows);
  } catch (e) {
    return apiError(e);
  }
}
