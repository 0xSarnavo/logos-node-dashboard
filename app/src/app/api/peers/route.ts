import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import pool from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [peersRes, countryRes, netRes] = await Promise.all([
      pool.query("SELECT * FROM peers WHERE lat IS NOT NULL ORDER BY last_seen DESC"),
      pool.query(`
        SELECT country, country_code, COUNT(*) as peer_count,
               AVG(lat) as avg_lat, AVG(lon) as avg_lon
        FROM peers WHERE country IS NOT NULL
        GROUP BY country, country_code
        ORDER BY peer_count DESC
      `),
      // Node's live connection counts (latest snapshot) — "connected right now"
      pool.query("SELECT n_peers, n_connections FROM network_snapshots ORDER BY ts DESC LIMIT 1"),
    ]);
    return NextResponse.json({
      peers: peersRes.rows,
      countries: countryRes.rows,
      total: peersRes.rows.length,
      connected_peers: netRes.rows[0]?.n_peers ?? null,
      connected: netRes.rows[0]?.n_connections ?? null,
      // Server wall-clock, so the page's staleness safety-net doesn't depend on the browser clock.
      server_now: Date.now(),
    });
  } catch (e) {
    return apiError(e);
  }
}
