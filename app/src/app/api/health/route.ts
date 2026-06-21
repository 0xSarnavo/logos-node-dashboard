import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { fetchNode } from "@/lib/node";

export const dynamic = "force-dynamic";

export async function GET() {
  const checks: Record<string, any> = {};
  let healthy = 0;
  let total = 0;

  // 1. Node reachable
  total++;
  try {
    const info = await fetchNode<any>("cryptarchia/info");
    if (info && info.slot !== undefined) {
      checks.node = { status: "ok", detail: `slot ${info.slot}, height ${info.height}` };
      healthy++;
    } else {
      checks.node = { status: "fail", detail: "Node returned empty response" };
    }
  } catch {
    checks.node = { status: "fail", detail: "Node unreachable" };
  }

  // 2. DB connected
  total++;
  try {
    const res = await pool.query("SELECT 1 AS ok");
    if (res.rows[0]?.ok === 1) {
      checks.database = { status: "ok", detail: "TimescaleDB connected" };
      healthy++;
    } else {
      checks.database = { status: "fail", detail: "Unexpected query result" };
    }
  } catch (e: any) {
    checks.database = { status: "fail", detail: e.message };
  }

  // 3. Indexer active (latest consensus_snapshot < 30s old)
  total++;
  try {
    const res = await pool.query(
      "SELECT ts FROM consensus_snapshots ORDER BY ts DESC LIMIT 1"
    );
    if (res.rows.length > 0) {
      const lastTs = new Date(res.rows[0].ts).getTime();
      const age = (Date.now() - lastTs) / 1000;
      if (age < 30) {
        checks.indexer = { status: "ok", detail: `Last snapshot ${Math.round(age)}s ago` };
        healthy++;
      } else {
        checks.indexer = {
          status: "degraded",
          detail: `Last snapshot ${Math.round(age)}s ago (stale)`,
        };
      }
    } else {
      checks.indexer = { status: "fail", detail: "No consensus snapshots found" };
    }
  } catch (e: any) {
    checks.indexer = { status: "fail", detail: e.message };
  }

  // 4. Peers geolocated
  total++;
  try {
    const res = await pool.query(
      "SELECT COUNT(*) AS geolocated FROM peers WHERE lat IS NOT NULL AND lon IS NOT NULL"
    );
    const count = parseInt(res.rows[0].geolocated);
    if (count > 0) {
      checks.peers_geo = { status: "ok", detail: `${count} peers geolocated` };
      healthy++;
    } else {
      checks.peers_geo = { status: "degraded", detail: "No geolocated peers" };
    }
  } catch (e: any) {
    checks.peers_geo = { status: "fail", detail: e.message };
  }

  // Overall status
  let overall: "healthy" | "degraded" | "unhealthy";
  if (healthy === total) {
    overall = "healthy";
  } else if (healthy >= total - 1) {
    overall = "degraded";
  } else {
    overall = "unhealthy";
  }

  return NextResponse.json({
    status: overall,
    checks_passed: healthy,
    checks_total: total,
    checks,
    timestamp: new Date().toISOString(),
  });
}
