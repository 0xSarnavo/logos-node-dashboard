import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { readAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Host/VM metrics, read from Prometheus (which scrapes node-exporter on the box).
const PROM = process.env.PROM_URL || "http://prometheus:9090";

// Run one instant PromQL query and return the first sample's scalar value (or null).
async function q(query: string): Promise<number | null> {
  try {
    const r = await fetch(`${PROM}/api/v1/query?query=${encodeURIComponent(query)}`, {
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    if (!r.ok) return null;
    const j = await r.json();
    const v = j?.data?.result?.[0]?.value?.[1];
    const n = v == null ? null : Number(v);
    return n != null && Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export async function GET() {
  if (!(await readAuth()).authed) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const [cpuIdle, steal, cores, l1, l5, l15, memTotal, memAvail, fsSize, fsAvail] = await Promise.all([
      q('avg(rate(node_cpu_seconds_total{mode="idle"}[1m]))*100'),
      q('avg(rate(node_cpu_seconds_total{mode="steal"}[1m]))*100'),
      q('count(count by (cpu)(node_cpu_seconds_total))'),
      q("node_load1"),
      q("node_load5"),
      q("node_load15"),
      q("node_memory_MemTotal_bytes"),
      q("node_memory_MemAvailable_bytes"),
      q('node_filesystem_size_bytes{mountpoint="/"}'),
      q('node_filesystem_avail_bytes{mountpoint="/"}'),
    ]);

    const cpuUsed = cpuIdle == null ? null : Math.max(0, Math.min(100, 100 - cpuIdle));
    const memUsed = memTotal != null && memAvail != null ? memTotal - memAvail : null;
    const diskUsed = fsSize != null && fsAvail != null ? fsSize - fsAvail : null;

    return NextResponse.json({
      cpu: { usedPct: cpuUsed, stealPct: steal, cores },
      mem: {
        totalBytes: memTotal,
        usedBytes: memUsed,
        usedPct: memTotal && memUsed != null ? (memUsed / memTotal) * 100 : null,
      },
      disk: {
        totalBytes: fsSize,
        usedBytes: diskUsed,
        usedPct: fsSize && diskUsed != null ? (diskUsed / fsSize) * 100 : null,
      },
      load: { l1, l5, l15 },
      ts: Date.now(),
    });
  } catch (e) {
    return apiError(e);
  }
}
