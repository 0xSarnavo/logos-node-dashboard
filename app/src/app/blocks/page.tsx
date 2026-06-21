"use client";
import Link from "next/link";
import { useState } from "react";
import { useLive } from "@/components/useLive";
import { SkeletonRows } from "@/components/Skeleton";
import SlotStrip from "@/components/SlotStrip";

function truncHash(h: string) {
  if (!h || h.length < 20) return h || "—";
  return h.slice(0, 8) + "\u2026" + h.slice(-6);
}

function fmtTime(ts: string) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function timeAgo(ts: string) {
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 5) return "now";
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

function BlockTimeCell({ ms, hasProd }: { ms: number | null; hasProd: boolean }) {
  if (!ms) return <span className="text-zinc-700">{hasProd ? "—" : ""}</span>;
  const s = ms / 1000;
  let color = "text-emerald-400/80";
  if (s >= 10) color = "text-zinc-300";
  if (s >= 30) color = "text-amber-400/80";
  if (s >= 60) color = "text-red-400/80";
  return <span className={`tabular-nums font-medium ${color}`}>{s.toFixed(1)}s</span>;
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`badge badge-${status}`}>{status}</span>;
}

function BlockTimeHistogram({ data }: { data: any[] }) {
  if (!data?.length) return null;
  const buckets = [
    { label: "0-10s", min: 0, max: 10, count: 0, color: "bg-emerald-500/50" },
    { label: "10-20s", min: 10, max: 20, count: 0, color: "bg-emerald-600/35" },
    { label: "20-30s", min: 20, max: 30, count: 0, color: "bg-amber-500/35" },
    { label: "30-60s", min: 30, max: 60, count: 0, color: "bg-amber-600/40" },
    { label: "60s+", min: 60, max: Infinity, count: 0, color: "bg-red-500/40" },
  ];
  const lc = ["text-emerald-400/80","text-emerald-400/60","text-amber-400/70","text-amber-500/80","text-red-400/70"];
  data.forEach(d => { if (d.value != null) buckets.find(b => d.value >= b.min && d.value < b.max)!.count++; });
  const max = Math.max(...buckets.map(b => b.count), 1);
  const total = buckets.reduce((s, b) => s + b.count, 0);

  return (
    <div className="glass rounded-xl p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-2.5">
        <h3 className="text-[11px] text-zinc-500 uppercase tracking-widest font-medium">Block Time Distribution</h3>
        <span className="text-[11px] text-zinc-600">{total} sampled</span>
      </div>
      <div className="space-y-1 flex-1 flex flex-col justify-between">
        {buckets.map((b, i) => {
          const pct = total > 0 ? Math.round((b.count / total) * 100) : 0;
          return (
            <div key={b.label} className="flex items-center gap-2 text-xs">
              <span className={`w-12 text-right tabular-nums font-medium ${lc[i]}`}>{b.label}</span>
              <div className="flex-1 h-5 bg-white/[0.02] rounded overflow-hidden relative">
                <div className={`h-full ${b.color} rounded transition-all duration-700`} style={{ width: `${(b.count / max) * 100}%` }} />
                {pct > 3 && <span className="absolute inset-y-0 left-1.5 flex items-center text-[9px] text-white/50 tabular-nums">{pct}%</span>}
              </div>
              <span className="w-7 text-zinc-600 tabular-nums text-right text-[11px]">{b.count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

type StatusFilter = "" | "pending" | "confirmed" | "orphaned";
type SpeedFilter = "" | "fast" | "slow";
type TimeRange = "" | "1h" | "6h" | "24h";

export default function BlocksPage() {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");
  const [speedFilter, setSpeedFilter] = useState<SpeedFilter>("");
  const [timeRange, setTimeRange] = useState<TimeRange>("");

  const qp = new URLSearchParams();
  qp.set("page", page.toString());
  qp.set("limit", perPage.toString());
  if (statusFilter) qp.set("status", statusFilter);
  if (speedFilter) qp.set("speed", speedFilter);
  if (timeRange) qp.set("range", timeRange);

  const { data } = useLive<any>(`/api/blocks?${qp.toString()}`, 3000);
  const { data: blockTimeData } = useLive<any[]>("/api/chain/history?metric=block_time", 30000);
  const blocks = data?.blocks ?? [];
  const resetPage = () => setPage(1);

  return (
    <div className="px-6 py-5 mx-auto pb-14">
      <h1 className="text-xl font-bold tracking-tight mb-4">Blocks</h1>

      {/* Histogram + Stats side by side, equal height */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4 sm:items-stretch">
        {/* Histogram — left, fills space */}
        <div className="flex-1 min-w-0">
          <BlockTimeHistogram data={blockTimeData ?? []} />
        </div>
        {/* Stats panel — right, stretches to match histogram */}
        <div className="glass rounded-xl p-3 w-full sm:w-[170px] sm:flex-shrink-0 flex flex-col justify-between">
          {[
            { label: "Tip Height", value: data?.tip_height?.toLocaleString() },
            { label: "Tip Slot", value: data?.tip_slot?.toLocaleString() },
            { label: "LIB Height", value: data?.lib_height?.toLocaleString() },
            { label: "Finality Lag", value: data?.tip_height && data?.lib_height ? (data.tip_height - data.lib_height).toString() : "—" },
            { label: "Pending", value: data?.tip_height && data?.lib_height ? (data.tip_height - data.lib_height).toString() : "—" },
            { label: "Indexed", value: data?.total?.toLocaleString() },
          ].map(s => (
            <div key={s.label} className="flex items-center justify-between py-1.5 border-b border-white/[0.03] last:border-0">
              <span className="text-[9px] text-zinc-600 uppercase tracking-widest">{s.label}</span>
              <span className="text-[12px] font-bold tabular-nums">{s.value ?? "—"}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Live slots strip */}
      <SlotStrip />

      {/* Filters */}
      <div className="flex items-center gap-3 mb-3 flex-wrap text-[11px]">
        <div className="flex items-center gap-0.5">
          {([["", "All"], ["pending", "Pending"], ["confirmed", "Confirmed"], ["orphaned", "Orphaned"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => { setStatusFilter(k); resetPage(); }}
              className={`px-2.5 py-1 rounded transition-all ${statusFilter === k ? "bg-white/[0.08] text-white border border-white/10" : "text-zinc-500 hover:text-zinc-300 border border-transparent"}`}>{l}</button>
          ))}
        </div>
        <span className="text-zinc-800">|</span>
        <div className="flex items-center gap-0.5">
          {([["", "Any speed"], ["fast", "Fast (<10s)"], ["slow", "Slow (>30s)"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => { setSpeedFilter(k); resetPage(); }}
              className={`px-2.5 py-1 rounded transition-all ${speedFilter === k ? "bg-white/[0.08] text-white border border-white/10" : "text-zinc-500 hover:text-zinc-300 border border-transparent"}`}>{l}</button>
          ))}
        </div>
        <span className="text-zinc-800">|</span>
        <div className="flex items-center gap-0.5">
          {([["", "All time"], ["1h", "1h"], ["6h", "6h"], ["24h", "24h"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => { setTimeRange(k); resetPage(); }}
              className={`px-2.5 py-1 rounded transition-all ${timeRange === k ? "bg-white/[0.08] text-white border border-white/10" : "text-zinc-500 hover:text-zinc-300 border border-transparent"}`}>{l}</button>
          ))}
        </div>
        <span className="text-zinc-800">|</span>
        <div className="flex items-center gap-0.5">
          <span className="text-zinc-600 mr-1">Show:</span>
          {[10, 25, 50, 100].map(n => (
            <button key={n} onClick={() => { setPerPage(n); resetPage(); }}
              className={`px-2 py-1 rounded transition-all ${perPage === n ? "bg-white/[0.08] text-white border border-white/10" : "text-zinc-500 hover:text-zinc-300 border border-transparent"}`}>{n}</button>
          ))}
        </div>
        <span className="ml-auto text-zinc-500">{data?.total?.toLocaleString() ?? "—"} total</span>
      </div>

      {/* Table */}
      <div className="glass rounded-xl overflow-hidden">
        <table className="w-full text-[12px] data-table">
          <thead>
            <tr className="text-[9px] text-zinc-600 uppercase tracking-widest">
              <th className="text-left py-2 px-3 font-medium">Height</th>
              <th className="text-left py-2 px-3 font-medium">Slot</th>
              <th className="text-left py-2 px-3 font-medium">Block Hash</th>
              <th className="text-right py-2 px-3 font-medium">Tx</th>
              <th className="text-right py-2 px-3 font-medium">Size</th>
              <th className="text-right py-2 px-3 font-medium">Block Time</th>
              <th className="text-right py-2 px-3 font-medium">Age</th>
              <th className="text-right py-2 px-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {blocks.map((b: any) => (
              <tr key={b.height}>
                <td className="py-1.5 px-3 tabular-nums font-medium">
                  <Link href={`/blocks/${b.height}`} className="hover:text-white transition-colors">{b.height?.toLocaleString()}</Link>
                </td>
                <td className="py-1.5 px-3 tabular-nums text-zinc-500">{b.slot?.toLocaleString()}</td>
                <td className="py-1.5 px-3">
                  <Link href={`/blocks/${b.height}`} className="hash text-zinc-300 hover:text-white transition-colors">{truncHash(b.block_hash)}</Link>
                </td>
                <td className="py-1.5 px-3 text-right tabular-nums text-zinc-500">{b.tx_count ?? "—"}</td>
                <td className="py-1.5 px-3 text-right tabular-nums text-zinc-600">{b.block_size ? `${b.block_size}` : "—"}</td>
                <td className="py-1.5 px-3 text-right"><BlockTimeCell ms={b.block_time_ms} hasProd={!!b.produced_at} /></td>
                <td className="py-1.5 px-3 text-right text-zinc-600 tabular-nums">
                  {b.produced_at ? timeAgo(b.produced_at) : b.indexed_at ? timeAgo(b.indexed_at) : "—"}
                </td>
                <td className="py-1.5 px-3 text-right"><StatusBadge status={b.status} /></td>
              </tr>
            ))}
            {!blocks.length && data && (
              <tr><td colSpan={8} className="py-8 text-center text-zinc-600">No blocks match filters</td></tr>
            )}
            {!data && <tr><td colSpan={8} className="p-0"><SkeletonRows rows={perPage > 25 ? 15 : 10} /></td></tr>}
          </tbody>
        </table>

        {data && data.pages > 1 && (() => {
          const total = data.pages;
          const pages: (number | "...")[] = [];
          const add = new Set<number>();
          [1, 2, page - 2, page - 1, page, page + 1, page + 2, total - 1, total].forEach(p => {
            if (p >= 1 && p <= total) add.add(p);
          });
          const sorted = [...add].sort((a, b) => a - b);
          sorted.forEach((p, i) => {
            if (i > 0 && p - sorted[i - 1] > 1) pages.push("...");
            pages.push(p);
          });
          return (
            <div className="flex items-center justify-between px-3 py-2.5 border-t border-white/[0.04]">
              {/* Left: count */}
              <span className="text-[11px] text-zinc-600 tabular-nums">
                {(page - 1) * perPage + 1}–{Math.min(page * perPage, data.total)} of {data.total.toLocaleString()}
              </span>

              {/* Center: pagination */}
              <div className="flex items-center gap-1 text-[11px]">
                <button onClick={() => setPage(1)} disabled={page === 1}
                  className="px-2 py-1 border border-white/[0.06] rounded hover:bg-white/[0.04] disabled:opacity-20 transition-colors text-zinc-500 text-[10px]">First</button>
                <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}
                  className="px-2 py-1 border border-white/[0.06] rounded hover:bg-white/[0.04] disabled:opacity-20 transition-colors text-zinc-400">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
                </button>
                {pages.map((p, i) =>
                  p === "..." ? (
                    <span key={`e${i}`} className="px-1 text-zinc-700">…</span>
                  ) : (
                    <button key={p} onClick={() => setPage(p)}
                      className={`min-w-[32px] py-1 rounded text-center transition-all ${
                        p === page ? "bg-white/[0.12] text-white border border-white/[0.15] font-semibold" : "text-zinc-500 hover:text-white hover:bg-white/[0.04] border border-transparent"
                      }`}>{p}</button>
                  )
                )}
                <button onClick={() => setPage(Math.min(total, page + 1))} disabled={page >= total}
                  className="px-2 py-1 border border-white/[0.06] rounded hover:bg-white/[0.04] disabled:opacity-20 transition-colors text-zinc-400">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
                </button>
                <button onClick={() => setPage(total)} disabled={page >= total}
                  className="px-2 py-1 border border-white/[0.06] rounded hover:bg-white/[0.04] disabled:opacity-20 transition-colors text-zinc-500 text-[10px]">Last</button>
              </div>

              {/* Right: jump to page */}
              <span className="flex items-center gap-1 text-[10px] text-zinc-600">
                Go to
                <input
                  type="number"
                  min={1}
                  max={total}
                  placeholder={page.toString()}
                  className="w-12 bg-white/[0.03] border border-white/[0.06] rounded px-1.5 py-0.5 text-center text-zinc-400 text-[10px] tabular-nums focus:outline-none focus:border-white/[0.12]"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const v = parseInt((e.target as HTMLInputElement).value);
                      if (v >= 1 && v <= total) { setPage(v); (e.target as HTMLInputElement).value = ""; }
                    }
                  }}
                />
                of {total}
              </span>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
