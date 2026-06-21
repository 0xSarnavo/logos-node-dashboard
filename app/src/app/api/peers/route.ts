import { NextResponse } from "next/server";
import pool from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [peersRes, countryRes] = await Promise.all([
      pool.query("SELECT * FROM peers WHERE lat IS NOT NULL ORDER BY last_seen DESC"),
      pool.query(`
        SELECT country, country_code, COUNT(*) as peer_count,
               AVG(lat) as avg_lat, AVG(lon) as avg_lon
        FROM peers WHERE country IS NOT NULL
        GROUP BY country, country_code
        ORDER BY peer_count DESC
      `),
    ]);
    return NextResponse.json({
      peers: peersRes.rows,
      countries: countryRes.rows,
      total: peersRes.rows.length,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
