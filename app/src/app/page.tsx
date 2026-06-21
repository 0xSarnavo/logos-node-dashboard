"use client";
import Link from "next/link";
import { useRef, useEffect } from "react";
import { useLive } from "@/components/useLive";
import Chart from "@/components/Chart";
import { SkeletonRows } from "@/components/Skeleton";
import { InfoTip } from "@/components/InfoTip";
import { opAccent } from "@/lib/tx";
import SlotStrip from "@/components/SlotStrip";

function Stat({ icon, label, value, sub, tip }: {
  icon: React.ReactNode; label: string; value: string; sub?: string; tip: string;
}) {
  return (
    <div className="stat-card rounded-xl p-4 animate-in">
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-medium">{label}</p>
        <span className="ml-auto flex"><InfoTip text={tip} align="right" /></span>
      </div>
      <p className="text-[1.75rem] font-bold tracking-tight leading-none text-white">{value}</p>
      {sub && <p className="text-[11px] text-zinc-600 mt-2">{sub}</p>}
    </div>
  );
}

function GistCard({ href, icon, title, stat, statSub, desc }: {
  href: string; icon: React.ReactNode; title: string; stat: string; statSub?: string; desc: string;
}) {
  return (
    <Link href={href} className="glass rounded-xl p-4 animate-in flex flex-col hover:border-white/[0.14] transition-colors group">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-zinc-400 group-hover:text-white transition-colors">{icon}</span>
        <h3 className="text-[13px] font-semibold text-white">{title}</h3>
        <svg className="w-4 h-4 text-zinc-700 group-hover:text-zinc-300 ml-auto group-hover:translate-x-0.5 transition-all" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
      </div>
      <p className="text-xl font-bold tabular-nums leading-none text-white">{stat}</p>
      {statSub && <p className="text-[10px] text-zinc-600 mt-1.5">{statSub}</p>}
      <p className="text-[11px] text-zinc-500 mt-3 leading-relaxed">{desc}</p>
    </Link>
  );
}

function truncHash(h: string) {
  if (!h || h.length < 20) return h || "—";
  return h.slice(0, 8) + "…" + h.slice(-6);
}

function timeAgo(ts: string) {
  if (!ts) return "—";
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (!Number.isFinite(s)) return "—";
  if (s < 5) return "just now";
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`badge badge-${status}`}>{status}</span>;
}

const I = {
  block: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>,
  tx: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" /></svg>,
  peers: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" /></svg>,
  node: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><rect x="3" y="4" width="18" height="12" rx="2" /><path strokeLinecap="round" d="M8 20h8M12 16v4" /></svg>,
  faucet: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3c-3 4-5 6.5-5 9a5 5 0 0010 0c0-2.5-2-5-5-9z" /></svg>,
};

export default function Home() {
  const { data: chain } = useLive<any>("/api/chain", 2000);
  const { data: walletData } = useLive<any>("/api/wallet", 10000);
  const { data: blocksData } = useLive<any>("/api/blocks?limit=30", 2000);
  const { data: bpmHistory } = useLive<any[]>("/api/chain/history?metric=blocks_per_5m", 10000);
  const { data: peersData } = useLive<any>("/api/peers", 30000);
  const { data: txData } = useLive<any>("/api/transactions?limit=20", 5000);
  const blocks = blocksData?.blocks ?? [];

  const prevMaxHeight = useRef<number>(0);
  const currentMax = blocks.length > 0 ? Math.max(...blocks.map((b: any) => b.height ?? 0)) : 0;
  useEffect(() => { if (currentMax > 0 && prevMaxHeight.current === 0) prevMaxHeight.current = currentMax; }, [currentMax]);
  const isNewRow = (height: number) => height > prevMaxHeight.current && prevMaxHeight.current > 0;
  useEffect(() => {
    if (currentMax > prevMaxHeight.current) {
      const timer = setTimeout(() => { prevMaxHeight.current = currentMax; }, 100);
      return () => clearTimeout(timer);
    }
  }, [currentMax]);

  return (
    <div className="px-6 py-5 mx-auto pb-10">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3 mb-4">
        <Stat tip="Total balance across all tracked wallets on this node."
          icon={<svg className="w-4 h-4 text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" d="M21 12V7H5a2 2 0 010-4h14v4m0 5v5a1 1 0 01-1 1H5a2 2 0 01-2-2V6"/><circle cx="18" cy="12" r="1"/></svg>}
          label="Wallet Balance" value={walletData?.total_balance != null ? walletData.total_balance.toLocaleString() : "---"} sub={`${walletData?.wallets?.length ?? 0} wallets`} />
        <Stat tip="The latest slot number in the consensus timeline. Slots advance at a fixed rate regardless of block production."
          icon={<svg className="w-4 h-4 text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z"/></svg>}
          label="Tip Slot" value={chain?.slot?.toLocaleString() ?? "—"} sub="Latest" />
        <Stat tip="The number of blocks produced on the chain. Each block contains validated transactions and state changes."
          icon={<svg className="w-4 h-4 text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>}
          label="Tip Height" value={chain?.height?.toLocaleString() ?? "—"} sub={chain?.finality_lag ? `+${chain.finality_lag} above LIB` : undefined} />
        <Stat tip="Last Irreversible Block slot. Blocks at or below this slot are finalized and cannot be reverted."
          icon={<svg className="w-4 h-4 text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>}
          label="LIB Slot" value={chain?.lib_slot?.toLocaleString() ?? "—"} sub="Finalized" />
        <Stat tip="Current sync mode. Online = fully synced. Syncing = catching up with the network."
          icon={<svg className="w-4 h-4 text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>}
          label="Mode" value={chain?.mode ?? "—"} sub="Cryptarchia" />
        <Stat tip="Peers connected on the P2P network. More peers = better connectivity and block propagation."
          icon={<svg className="w-4 h-4 text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"/></svg>}
          label="Peers" value={chain?.peers?.toString() ?? "—"} sub={`${chain?.connections ?? 0} connections`} />
        <Stat tip="Average time between blocks over the last 30 minutes. Lower = faster chain."
          icon={<svg className="w-4 h-4 text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>}
          label="Block Time" value={chain?.avg_block_time ? `${chain.avg_block_time}s` : "—"} sub="30m avg" />
      </div>

      {/* Sync indicator */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1.5">
          {chain?.caught_up ? (
            <><span className="w-2 h-2 rounded-full bg-emerald-500/70 live-dot" /><span className="text-xs text-emerald-400/80 font-medium">In Sync</span></>
          ) : (
            <><span className="w-2 h-2 rounded-full bg-amber-400/70 live-dot" /><span className="text-xs text-amber-400/80 font-medium">Syncing {chain?.sync_percent != null ? `${chain.sync_percent.toFixed(2)}%` : "..."}{chain?.slots_behind != null && <span className="text-zinc-500 ml-1.5">({chain.slots_behind.toLocaleString()} slots behind)</span>}</span></>
          )}
        </div>
        <div className="w-full h-1 rounded-full bg-white/[0.04] overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-1000 ${chain?.caught_up ? "bg-emerald-500/50" : "bg-white/20"}`} style={{ width: `${Math.min(100, chain?.sync_percent ?? 0)}%` }} />
        </div>
      </div>

      {/* Explore — gist of each page */}
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-[10px] text-zinc-500 uppercase tracking-widest font-medium">Explore</h2>
        <span className="text-[10px] text-zinc-600">jump into any section</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        <GistCard href="/blocks" icon={I.block} title="Blocks"
          stat={chain?.height?.toLocaleString() ?? "—"} statSub={`${chain?.avg_block_time ?? "—"}s avg · ${chain?.finality_lag ?? "—"} finality lag`}
          desc="Block explorer with time distribution and the live slot strip." />
        <GistCard href="/transactions" icon={I.tx} title="Transactions"
          stat={txData?.total?.toLocaleString() ?? "—"} statSub="decoded transactions"
          desc="Transfers & channel inscriptions, decoded per operation." />
        <GistCard href="/peers" icon={I.peers} title="Peers"
          stat={peersData?.total?.toLocaleString() ?? "—"} statSub={`${peersData?.countries?.length ?? "—"} countries`}
          desc="Rotating globe, leaderboards, and network health." />
        <GistCard href="/node" icon={I.node} title="My Node"
          stat={chain?.sync_percent != null ? `${Math.min(100, chain.sync_percent).toFixed(0)}%` : "—"} statSub={`${chain?.mode ?? "—"} · ${chain?.caught_up ? "in sync" : "syncing"}`}
          desc="Sync, health, charts, wallets, and node identity." />
        <GistCard href="/faucet" icon={I.faucet} title="Faucet"
          stat={walletData?.total_balance != null ? walletData.total_balance.toLocaleString() : "—"} statSub={`${walletData?.wallets?.length ?? 0} wallets`}
          desc="Drip testnet tokens to your wallets, server-side." />
      </div>

      {/* Chain activity — full-width section, above */}
      <div className="glass rounded-xl overflow-hidden animate-in mb-4">
        <div className="flex items-center justify-between px-5 py-3">
          <div className="flex items-center gap-2.5">
            <svg className="w-4 h-4 text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            <h2 className="text-[13px] font-semibold text-white">Chain activity</h2>
          </div>
          <Link href="/node" className="text-[11px] text-zinc-500 hover:text-white transition-colors">My Node →</Link>
        </div>
        <div className="glow-separator" />
        {/* Live Slots */}
        <div className="p-4">
          <SlotStrip bare count={200} />
        </div>
        <div className="glow-separator" />
        {/* Recent Blocks */}
        <div className="p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[9px] text-zinc-600 uppercase tracking-widest font-medium">Recent Blocks · per 5 min</p>
            <span className="text-[10px] text-zinc-600 tabular-nums">{chain?.blocks_1h ?? "—"} in last hour</span>
          </div>
          <Chart data={bpmHistory ?? []} type="bar" color="#a1a1aa" height={140} />
        </div>
      </div>

      {/* Latest blocks + Latest transactions, side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Latest Blocks */}
        <div className="glass rounded-xl overflow-hidden animate-in flex flex-col" style={{ animationDelay: '0.05s' }}>
          <div className="flex items-center justify-between px-5 py-3">
            <div className="flex items-center gap-2.5">
              <svg className="w-4 h-4 text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
              <h2 className="text-[13px] font-semibold text-white">Latest blocks</h2>
              <span className="flex items-center gap-1.5 text-[10px] text-zinc-500"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500/70 live-dot" /> Live</span>
            </div>
            <Link href="/blocks" className="text-[11px] text-zinc-500 hover:text-white transition-colors">View all →</Link>
          </div>
          <div className="glow-separator" />
          <div className="max-h-[420px] overflow-y-auto">
            <table className="w-full text-xs data-table">
              <thead className="sticky top-0 bg-black/40 backdrop-blur-sm">
                <tr className="text-[9px] text-zinc-600 uppercase tracking-widest">
                  <th className="text-left py-2 px-5 font-medium">Height</th>
                  <th className="text-left py-2 px-5 font-medium">Header</th>
                  <th className="text-right py-2 px-5 font-medium">Age</th>
                  <th className="text-right py-2 px-5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {blocks.slice(0, 20).map((b: any, i: number) => (
                  <tr key={b.height} className={`animate-in ${isNewRow(b.height) ? "row-new" : ""}`} style={{ animationDelay: `${i * 20}ms` }}>
                    <td className="py-2 px-5 text-zinc-500 tabular-nums">{b.height?.toLocaleString()}</td>
                    <td className="py-2 px-5"><Link href={`/blocks/${b.height}`} className="hash text-zinc-300 hover:text-white transition-colors">{truncHash(b.block_hash)}</Link></td>
                    <td className="py-2 px-5 text-right text-zinc-600 tabular-nums">{timeAgo(b.produced_at || b.indexed_at)}</td>
                    <td className="py-2 px-5 text-right"><StatusBadge status={b.status ?? "confirmed"} /></td>
                  </tr>
                ))}
                {!blocks.length && <tr><td colSpan={4} className="p-0"><SkeletonRows rows={8} /></td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {/* Latest Transactions */}
        <div className="glass rounded-xl overflow-hidden animate-in flex flex-col" style={{ animationDelay: '0.1s' }}>
          <div className="flex items-center justify-between px-5 py-3">
            <div className="flex items-center gap-2.5">
              <svg className="w-4 h-4 text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"/></svg>
              <h2 className="text-[13px] font-semibold text-white">Latest transactions</h2>
              <span className="flex items-center gap-1.5 text-[10px] text-zinc-500"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500/70 live-dot" /> Live</span>
            </div>
            <Link href="/transactions" className="text-[11px] text-zinc-500 hover:text-white transition-colors">View all →</Link>
          </div>
          <div className="glow-separator" />
          <div className="max-h-[420px] overflow-y-auto">
            <table className="w-full text-xs data-table">
              <thead className="sticky top-0 bg-black/40 backdrop-blur-sm">
                <tr className="text-[9px] text-zinc-600 uppercase tracking-widest">
                  <th className="text-left py-2 px-5 font-medium">Slot</th>
                  <th className="text-left py-2 px-5 font-medium">Type</th>
                  <th className="text-left py-2 px-5 font-medium">Block</th>
                  <th className="text-right py-2 px-5 font-medium">Age</th>
                </tr>
              </thead>
              <tbody>
                {(txData?.transactions ?? []).slice(0, 20).map((t: any, i: number) => (
                  <tr key={`${t.block_hash}-${t.index}-${i}`}>
                    <td className="py-2 px-5 text-zinc-500 tabular-nums">{t.slot?.toLocaleString()}</td>
                    <td className="py-2 px-5">
                      <Link href={`/transactions/${t.block_hash}`} className="flex flex-wrap gap-1">
                        {(t.opcodes ?? []).slice(0, 2).map((o: any, j: number) => (
                          <span key={j} className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${opAccent(o.code)}`}>{o.name}</span>
                        ))}
                      </Link>
                    </td>
                    <td className="py-2 px-5 tabular-nums"><Link href={`/blocks/${t.height}`} className="text-zinc-400 hover:text-white transition-colors">#{t.height?.toLocaleString()}</Link></td>
                    <td className="py-2 px-5 text-right text-zinc-600 tabular-nums">{timeAgo(t.indexed_at)}</td>
                  </tr>
                ))}
                {!txData && <tr><td colSpan={4} className="p-0"><SkeletonRows rows={8} /></td></tr>}
                {txData && !(txData?.transactions ?? []).length && <tr><td colSpan={4} className="py-8 text-center text-zinc-600">No transactions yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

    </div>
  );
}
