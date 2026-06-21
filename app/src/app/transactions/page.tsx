"use client";
import Link from "next/link";
import { useState } from "react";
import { useLive } from "@/components/useLive";
import { SkeletonRows } from "@/components/Skeleton";
import { opAccent } from "@/lib/tx";
import { RANGES } from "@/lib/ranges";
import { timeAgo, truncHash } from "@/lib/format";


function OpBadge({ name, code }: { name: string; code: number }) {
  return <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${opAccent(code)}`}>{name}</span>;
}

function BlockStrip({ blocks, onSelect, selectedHeight }: { blocks: any[]; onSelect: (b: any) => void; selectedHeight: number | null }) {
  if (!blocks.length) return null;
  return (
    <div className="glass rounded-xl p-4 mb-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-medium">Recent Blocks</span>
        <span className="text-[10px] text-zinc-600">{blocks.filter((b: any) => b.tx_count > 0).length}/{blocks.length} with transactions · click to filter</span>
      </div>
      <div className="flex gap-[2px]">
        {blocks.slice().reverse().map((b: any) => {
          const hasTx = b.tx_count > 0;
          const sel = selectedHeight === b.height;
          const color = hasTx ? (b.final ? "bg-emerald-500/70" : "bg-amber-500/70") : "bg-white/[0.04]";
          const hover = hasTx ? (b.final ? "hover:bg-emerald-400/90" : "hover:bg-amber-400/90") : "";
          return (
            <button key={b.height} onClick={() => hasTx && onSelect(b)} disabled={!hasTx}
              className={`flex-1 h-7 rounded-[2px] transition-all group relative ${color} ${hover} ${hasTx ? "cursor-pointer" : "cursor-default"} ${sel ? "ring-2 ring-white/70" : ""}`}
              title={`Block #${b.height} — ${b.tx_count} tx · ${hasTx ? (b.final ? "final" : "unfinalized") : "empty"}`}>
              <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[8px] text-zinc-500 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">#{b.height}</span>
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-3 mt-2 text-[9px] text-zinc-600 flex-wrap">
        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-[1px] bg-emerald-500/70" /> final · has tx</span>
        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-[1px] bg-amber-500/70" /> unfinalized · has tx</span>
        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-[1px] bg-white/[0.06]" /> empty</span>
      </div>
    </div>
  );
}

const PERIODS = [{ id: "all", label: "All" }, ...RANGES.map((r) => ({ id: r.id, label: r.label }))];

export default function TransactionsPage() {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [range, setRange] = useState("all");
  const [blockFilter, setBlockFilter] = useState<{ hash: string; height: number } | null>(null);

  const url = blockFilter
    ? `/api/transactions?block=${blockFilter.hash}`
    : `/api/transactions?page=${page}&limit=${perPage}&range=${range}`;
  const { data } = useLive<any>(url, blockFilter ? 0 : 5000);

  const txs = data?.transactions ?? [];
  const recentBlocks = data?.recent_blocks ?? [];
  const resetPage = () => setPage(1);

  return (
    <div className="px-6 py-5 mx-auto pb-14">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-bold tracking-tight">Transactions</h1>
        <span className="text-[11px] text-zinc-500">{data?.total?.toLocaleString() ?? "—"} found · newest first</span>
      </div>
      <p className="text-[11px] text-zinc-600 mb-4">Decoded from node blocks. Click a block to filter, or a row for the full operation breakdown.</p>

      <BlockStrip blocks={recentBlocks} selectedHeight={blockFilter?.height ?? null}
        onSelect={(b) => { setBlockFilter({ hash: b.block_hash, height: b.height }); }} />

      {/* Active block filter banner */}
      {blockFilter && (
        <div className="flex items-center gap-2 mb-3 text-[12px]">
          <span className="text-zinc-400">Showing transactions in block <span className="text-white font-medium tabular-nums">#{blockFilter.height?.toLocaleString()}</span></span>
          <button onClick={() => setBlockFilter(null)} className="text-[11px] px-2 py-0.5 rounded border border-white/10 text-zinc-400 hover:text-white hover:bg-white/[0.04] transition-colors">✕ Clear</button>
        </div>
      )}

      {/* Period + page-size on one line, separated by a divider */}
      {!blockFilter && (
        <div className="flex items-center gap-1.5 mb-3 flex-wrap text-[11px]">
          <span className="text-[10px] text-zinc-600 uppercase tracking-widest font-medium mr-1">Period</span>
          {PERIODS.map((p) => (
            <button key={p.id} onClick={() => { setRange(p.id); resetPage(); }}
              className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${range === p.id ? "bg-white/10 text-white" : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]"}`}>{p.label}</button>
          ))}
          <span className="text-zinc-700 mx-1.5">|</span>
          <span className="text-zinc-600 mr-1">Show:</span>
          {[10, 25, 50, 100].map(n => (
            <button key={n} onClick={() => { setPerPage(n); resetPage(); }}
              className={`px-2 py-1 rounded transition-all ${perPage === n ? "bg-white/[0.08] text-white border border-white/10" : "text-zinc-500 hover:text-zinc-300 border border-transparent"}`}>{n}</button>
          ))}
          <span className="ml-auto text-zinc-500">{data?.total?.toLocaleString() ?? "—"} total</span>
        </div>
      )}

      <div className="glass rounded-xl overflow-hidden">
        <table className="w-full text-[12px] data-table">
          <thead>
            <tr className="text-[9px] text-zinc-600 uppercase tracking-widest">
              <th className="text-left py-2.5 px-4 font-medium">Slot</th>
              <th className="text-left py-2.5 px-4 font-medium">Type</th>
              <th className="text-left py-2.5 px-4 font-medium">Status</th>
              <th className="text-left py-2.5 px-4 font-medium">Block</th>
              <th className="text-left py-2.5 px-4 font-medium">Block Hash</th>
              <th className="text-right py-2.5 px-4 font-medium">Ops</th>
              <th className="text-right py-2.5 px-4 font-medium">Age</th>
            </tr>
          </thead>
          <tbody>
            {txs.map((tx: any, i: number) => (
              <tr key={`${tx.block_hash}-${tx.index}-${i}`}>
                <td className="py-2 px-4 tabular-nums text-zinc-500"><Link href={`/transactions/${tx.block_hash}`} className="block">{tx.slot?.toLocaleString()}</Link></td>
                <td className="py-2 px-4">
                  <Link href={`/transactions/${tx.block_hash}`} className="flex flex-wrap gap-1">
                    {(tx.opcodes ?? []).slice(0, 3).map((o: any, j: number) => <OpBadge key={j} name={o.name} code={o.code} />)}
                    {(tx.opcodes?.length ?? 0) > 3 && <span className="text-[10px] text-zinc-600">+{tx.opcodes.length - 3}</span>}
                  </Link>
                </td>
                <td className="py-2 px-4"><span className={`badge ${tx.final ? "badge-confirmed" : "badge-pending"}`}>{tx.final ? "confirmed" : "pending"}</span></td>
                <td className="py-2 px-4 tabular-nums font-medium"><Link href={`/blocks/${tx.height}`} className="hover:text-white transition-colors">#{tx.height?.toLocaleString()}</Link></td>
                <td className="py-2 px-4"><Link href={`/transactions/${tx.block_hash}`} className="hash text-zinc-300 hover:text-white transition-colors">{truncHash(tx.block_hash)}</Link></td>
                <td className="py-2 px-4 text-right tabular-nums font-medium">{tx.op_count}</td>
                <td className="py-2 px-4 text-right text-zinc-600 tabular-nums">{tx.indexed_at ? timeAgo(tx.indexed_at) : "—"}</td>
              </tr>
            ))}
            {!txs.length && data && (
              <tr><td colSpan={7} className="py-8 text-center text-zinc-600">{blockFilter ? "No transactions in this block." : "No transactions in this period."}</td></tr>
            )}
            {!data && <tr><td colSpan={7} className="p-0"><SkeletonRows rows={12} /></td></tr>}
          </tbody>
        </table>

        {!blockFilter && data && data.pages > 1 && (() => {
          const total = data.pages;
          const pages: (number | "...")[] = [];
          const add = new Set<number>();
          [1, 2, page - 2, page - 1, page, page + 1, page + 2, total - 1, total].forEach(p => { if (p >= 1 && p <= total) add.add(p); });
          const sorted = [...add].sort((a, b) => a - b);
          sorted.forEach((p, i) => { if (i > 0 && p - sorted[i - 1] > 1) pages.push("..."); pages.push(p); });
          return (
            <div className="flex items-center justify-between px-3 py-2.5 border-t border-white/[0.04]">
              <span className="text-[11px] text-zinc-600 tabular-nums">{(page - 1) * perPage + 1}–{Math.min(page * perPage, data.total)} of {data.total.toLocaleString()}</span>
              <div className="flex items-center gap-1 text-[11px]">
                <button onClick={() => setPage(1)} disabled={page === 1} className="px-2 py-1 border border-white/[0.06] rounded hover:bg-white/[0.04] disabled:opacity-20 transition-colors text-zinc-500 text-[10px]">First</button>
                <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="px-2 py-1 border border-white/[0.06] rounded hover:bg-white/[0.04] disabled:opacity-20 transition-colors text-zinc-400">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
                </button>
                {pages.map((p, i) => p === "..." ? <span key={`e${i}`} className="px-1 text-zinc-700">…</span> : (
                  <button key={p} onClick={() => setPage(p)} className={`min-w-[32px] py-1 rounded text-center transition-all ${p === page ? "bg-white/[0.12] text-white border border-white/[0.15] font-semibold" : "text-zinc-500 hover:text-white hover:bg-white/[0.04] border border-transparent"}`}>{p}</button>
                ))}
                <button onClick={() => setPage(Math.min(total, page + 1))} disabled={page >= total} className="px-2 py-1 border border-white/[0.06] rounded hover:bg-white/[0.04] disabled:opacity-20 transition-colors text-zinc-400">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
                </button>
                <button onClick={() => setPage(total)} disabled={page >= total} className="px-2 py-1 border border-white/[0.06] rounded hover:bg-white/[0.04] disabled:opacity-20 transition-colors text-zinc-500 text-[10px]">Last</button>
              </div>
              <span className="flex items-center gap-1 text-[10px] text-zinc-600">Go to
                <input type="number" min={1} max={total} placeholder={page.toString()}
                  className="w-12 bg-white/[0.03] border border-white/[0.06] rounded px-1.5 py-0.5 text-center text-zinc-400 text-[10px] tabular-nums focus:outline-none focus:border-white/[0.12]"
                  onKeyDown={(e) => { if (e.key === "Enter") { const v = parseInt((e.target as HTMLInputElement).value); if (v >= 1 && v <= total) { setPage(v); (e.target as HTMLInputElement).value = ""; } } }} />
                of {total}
              </span>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
