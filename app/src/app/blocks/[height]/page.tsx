"use client";
import Link from "next/link";
import { useLive } from "@/components/useLive";
import { useParams } from "next/navigation";
import { useState } from "react";
import { SkeletonRows } from "@/components/Skeleton";
import { InfoTip } from "@/components/InfoTip";

function CopyBtn({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1500); }}
      className="ml-2 px-1.5 py-0.5 text-[10px] border border-white/[0.06] rounded hover:text-white hover:border-white/[0.12] transition-colors text-zinc-500 flex-shrink-0">
      {ok ? "Copied!" : "Copy"}
    </button>
  );
}

function Row({ label, tip, mono, children, value }: { label: string; tip?: string; mono?: boolean; children?: React.ReactNode; value?: string }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-1 py-2.5 border-b border-white/[0.03]">
      <div className="w-44 flex-shrink-0 flex items-center gap-1.5">
        <span className="text-[11px] text-zinc-500 uppercase tracking-widest font-medium">{label}</span>
        {tip && <InfoTip text={tip} />}
      </div>
      {children || <span className={`text-[12px] break-all ${mono ? "hash" : ""}`}>{value ?? "—"}</span>}
    </div>
  );
}

function StatusBadge({ status, large }: { status: string; large?: boolean }) {
  return <span className={`badge badge-${status} ${large ? "text-[11px] px-3 py-1" : ""}`}>{status}</span>;
}

function timeAgo(ts: string) {
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function BlockTimeDisplay({ ms }: { ms: number }) {
  const s = ms / 1000;
  let color = "text-emerald-400/80";
  let label = "Fast";
  if (s >= 10) { color = "text-zinc-300"; label = "Normal"; }
  if (s >= 30) { color = "text-amber-400/80"; label = "Slow"; }
  if (s >= 60) { color = "text-red-400/80"; label = "Very slow"; }
  return (
    <span className="flex items-center gap-2">
      <span className={`text-[12px] font-medium tabular-nums ${color}`}>{s.toFixed(1)}s</span>
      <span className="text-[10px] text-zinc-600">({label})</span>
    </span>
  );
}

export default function BlockDetail() {
  const params = useParams();
  const height = params.height as string;
  const { data, error } = useLive<any>(`/api/blocks/${height}`, 5000);

  if (error || data?.error) {
    return (
      <div className="px-6 py-8 max-w-[1000px] mx-auto">
        <h1 className="text-xl font-bold mb-3">Block Not Found</h1>
        <p className="text-zinc-500 text-sm mb-4">Block #{height} has not been indexed yet. It may not exist or the indexer hasn't reached it.</p>
        <Link href="/blocks" className="text-sm text-zinc-400 hover:text-white transition-colors">← Back to blocks</Link>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="px-6 py-8 max-w-[1000px] mx-auto">
        <div className="h-8 w-48 bg-white/[0.03] rounded mb-6 shimmer" />
        <div className="glass rounded-xl p-5"><SkeletonRows rows={8} /></div>
      </div>
    );
  }

  const { block, event, chain_context: ctx, snapshot, neighbors, nearby_blocks: nearby, block_content: bc } = data;
  const h = parseInt(height);
  const prevBlock = neighbors.prev[0];
  const nextBlock = neighbors.next[0];

  return (
    <div className="px-6 py-5 max-w-[1100px] mx-auto pb-14">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <Link href="/blocks" className="px-2 py-1 border border-white/[0.06] rounded hover:bg-white/[0.04] transition-colors text-zinc-400">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
          </Link>
          <h1 className="text-xl font-bold tracking-tight">Block #{h.toLocaleString()}</h1>
          <StatusBadge status={block.status} large />
        </div>
        <div className="flex gap-1.5">
          {prevBlock && (
            <Link href={`/blocks/${prevBlock.height}`}
              className="px-2.5 py-1 text-[11px] border border-white/[0.06] rounded hover:bg-white/[0.04] transition-colors text-zinc-400">
              ← #{prevBlock.height.toLocaleString()}
            </Link>
          )}
          {nextBlock && (
            <Link href={`/blocks/${nextBlock.height}`}
              className="px-2.5 py-1 text-[11px] border border-white/[0.06] rounded hover:bg-white/[0.04] transition-colors text-zinc-400">
              #{nextBlock.height.toLocaleString()} →
            </Link>
          )}
        </div>
      </div>

      {/* Visual chain timeline */}
      <div className="flex items-center justify-center gap-0.5 mb-6 text-[10px]">
        {neighbors.prev.slice().reverse().map((n: any) => (
          <Link key={n.height} href={`/blocks/${n.height}`}
            className="px-2 py-0.5 rounded text-zinc-600 hover:text-white hover:bg-white/[0.04] transition-colors tabular-nums">
            {n.height.toLocaleString()}
          </Link>
        ))}
        <span className="px-3 py-1 rounded bg-white/[0.1] border border-white/[0.12] text-white font-semibold tabular-nums mx-1">
          {h.toLocaleString()}
        </span>
        {neighbors.next.map((n: any) => (
          <Link key={n.height} href={`/blocks/${n.height}`}
            className="px-2 py-0.5 rounded text-zinc-600 hover:text-white hover:bg-white/[0.04] transition-colors tabular-nums">
            {n.height.toLocaleString()}
          </Link>
        ))}
      </div>

      {/* Unified Block Details — merges explorer DB + RocksDB sidecar */}
      <div className="glass rounded-xl overflow-hidden mb-4">
        <div className="px-5 py-3 flex items-center justify-between">
          <h3 className="text-[10px] text-zinc-500 uppercase tracking-widest font-medium">Block Details</h3>
          <span className="text-[10px] text-zinc-700">{bc ? `${bc.size} bytes` : ""}</span>
        </div>
        <div className="glow-separator" />
        <div className="px-5 py-2">
          {/* Parent — from RocksDB (actual) */}
          <Row label="Parent" tip="Hash of the previous block this block builds on." mono>
            <div className="flex items-center">
              {bc ? (
                <Link href={`/blocks/${neighbors.prev[0]?.height}`} className="text-[12px] break-all hash text-blue-400/70 hover:text-blue-300 transition-colors">{bc.parent_hash}</Link>
              ) : (
                <span className="text-[12px] text-zinc-600">Loading...</span>
              )}
              {bc && <CopyBtn text={bc.parent_hash} />}
            </div>
          </Row>

          {/* Slot — from RocksDB (actual, not estimated) */}
          <Row label="Slot" tip="The consensus time slot this block was produced in. Slots tick every second." value={(bc?.slot ?? ctx.estimated_slot)?.toLocaleString()} />

          <Row label="Height" value={h.toLocaleString()} />

          <Row label="Status" tip="Confirmed = finalized, irreversible. Pending = awaiting LIB. Orphaned = replaced by reorg.">
            <div className="flex items-center gap-2">
              <StatusBadge status={block.status} large />
              {block.status === "confirmed" && ctx.confirmations > 0 && (
                <span className="text-[10px] text-zinc-600">{ctx.confirmations.toLocaleString()} confirmations</span>
              )}
              {block.status === "pending" && ctx.blocks_to_finality > 0 && (
                <span className="text-[10px] text-zinc-600">{ctx.blocks_to_finality} blocks to finality</span>
              )}
            </div>
          </Row>

          <Row label="Version" value={bc?.version?.toString() ?? "—"} />

          {/* Block Root — from RocksDB */}
          <Row label="Block Root" tip="Merkle root of the block's state tree." mono>
            {bc ? (
              <div className="flex items-center">
                <span className="text-[12px] break-all hash">{bc.block_root}</span>
                <CopyBtn text={bc.block_root} />
              </div>
            ) : <span className="text-[12px] text-zinc-600">—</span>}
          </Row>

          <Row label="Voucher CM" tip="Voucher commitment — links this block to the staking/voucher system." mono>
            {bc?.voucher_cm ? (
              <div className="flex items-center">
                <span className="text-[12px] break-all hash">{bc.voucher_cm}</span>
                <CopyBtn text={bc.voucher_cm} />
              </div>
            ) : <span className="text-[12px] text-zinc-600">—</span>}
          </Row>

          <Row label="Entropy" tip="Random entropy for Cryptarchia leader selection." mono>
            {bc?.entropy ? (
              <div className="flex items-center">
                <span className="text-[12px] break-all hash">{bc.entropy}</span>
                <CopyBtn text={bc.entropy} />
              </div>
            ) : <span className="text-[12px] text-zinc-600">—</span>}
          </Row>

          <Row label="Leader Key" tip="Cryptarchia PoL leader key — not a wallet address. Cannot be linked to a stable operator identity." mono>
            {bc?.leader_key ? (
              <div className="flex items-center">
                <span className="text-[12px] break-all hash">{bc.leader_key}</span>
                <CopyBtn text={bc.leader_key} />
              </div>
            ) : <span className="text-[12px] text-zinc-600">—</span>}
          </Row>

          {/* Block time — from explorer DB */}
          {event ? (
            <Row label="Block Time" tip="Time between this block and the previous one.">
              <BlockTimeDisplay ms={event.block_time_ms} />
            </Row>
          ) : (
            <Row label="Block Time" value="—" />
          )}

          {/* Timestamps — from explorer DB */}
          {event && (
            <Row label="Produced" tip="When the indexer first detected this new block height.">
              <span className="text-[12px]">
                {new Date(event.produced_at).toLocaleString()}
                <span className="text-zinc-600 ml-2">({timeAgo(event.produced_at)})</span>
              </span>
            </Row>
          )}

          <Row label="Indexed" tip="When the block hash was stored in the explorer database.">
            <span className="text-[12px]">
              {new Date(block.indexed_at).toLocaleString()}
              <span className="text-zinc-600 ml-2">({timeAgo(block.indexed_at)})</span>
            </span>
          </Row>

          {/* Chain position — from explorer DB */}
          <Row label="Confirmations" tip="How many blocks have been finalized after this one." value={block.status === "confirmed" ? ctx.confirmations?.toLocaleString() : "0"} />
          <Row label="Distance" tip="How far this block is from the current chain tip." value={`${(ctx.tip_height - h).toLocaleString()} blocks from tip`} />
        </div>
      </div>

      {/* Transactions */}
      <div className="glass rounded-xl overflow-hidden mt-4">
        <div className="px-5 py-3">
          <h3 className="text-[10px] text-zinc-500 uppercase tracking-widest font-medium">
            Transactions {bc ? `(${bc.tx_count ?? 0})` : ""}
          </h3>
        </div>
        <div className="glow-separator" />
        {!bc ? (
          <div className="px-5 py-6 text-center text-[12px] text-zinc-500 flex items-center justify-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-white/30 live-dot" />
            Loading transaction data...
          </div>
        ) : bc.tx_count > 0 ? (
          <div>
            {/* Show detected transactions if available */}
            {bc.transactions?.length > 0 ? (
              <table className="w-full text-[12px] data-table">
                <thead>
                  <tr className="text-[9px] text-zinc-600 uppercase tracking-widest">
                    <th className="text-left py-2 px-5 font-medium">#</th>
                    <th className="text-left py-2 px-5 font-medium">Type</th>
                    <th className="text-right py-2 px-5 font-medium">Amount</th>
                    <th className="text-left py-2 px-5 font-medium">Recipient</th>
                  </tr>
                </thead>
                <tbody>
                  {bc.transactions.map((tx: any, i: number) => (
                    <tr key={i}>
                      <td className="py-2 px-5 text-zinc-500">{i + 1}</td>
                      <td className="py-2 px-5">
                        <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400/70 rounded text-[10px] font-medium">{tx.type}</span>
                      </td>
                      <td className="py-2 px-5 text-right tabular-nums font-medium">{tx.amount?.toLocaleString()}</td>
                      <td className="py-2 px-5 hash text-zinc-400">{tx.recipient?.slice(0, 20)}...</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              /* tx_count > 0 but no detailed transactions parsed yet */
              <div className="px-5 py-4">
                <div className="flex items-center gap-4 mb-3">
                  {Array.from({ length: bc.tx_count }).map((_: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 glass rounded-lg px-3 py-2">
                      <span className="text-[10px] text-zinc-500">Tx {i + 1}</span>
                      <span className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400/70 rounded text-[9px] font-medium">note_transfer</span>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-zinc-600">
                  {bc.tx_count} transaction{bc.tx_count > 1 ? "s" : ""} detected from block size ({bc.size} bytes).
                  Detailed transaction parsing is based on binary pattern matching of the serialized block data.
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="px-5 py-6 text-center text-[12px] text-zinc-600">
            No transactions in this block.
          </div>
        )}
      </div>

      {/* Nearby blocks */}
      <div className="glass rounded-xl overflow-hidden mt-4">
        <div className="px-5 py-3">
          <h3 className="text-[10px] text-zinc-500 uppercase tracking-widest font-medium">Nearby Blocks</h3>
        </div>
        <div className="glow-separator" />
        <table className="w-full text-[12px] data-table">
          <thead>
            <tr className="text-[9px] text-zinc-600 uppercase tracking-widest">
              <th className="text-left py-2 px-5 font-medium">Height</th>
              <th className="text-left py-2 px-5 font-medium">Hash</th>
              <th className="text-right py-2 px-5 font-medium">Block Time</th>
              <th className="text-right py-2 px-5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {(nearby ?? []).map((n: any) => {
              const isCurrent = n.height === h;
              return (
                <tr key={`${n.height}-${n.hash_short}`} className={isCurrent ? "bg-white/[0.04]" : ""}>
                  <td className="py-2 px-5 tabular-nums font-medium">
                    {isCurrent ? (
                      <span className="text-white">{n.height.toLocaleString()} ←</span>
                    ) : (
                      <Link href={`/blocks/${n.height}`} className="text-zinc-400 hover:text-white transition-colors">{n.height.toLocaleString()}</Link>
                    )}
                  </td>
                  <td className="py-2 px-5 hash text-zinc-400">{n.hash_short}...</td>
                  <td className="py-2 px-5 text-right tabular-nums">
                    {n.block_time_ms ? (
                      <span className={
                        n.block_time_ms < 10000 ? "text-emerald-400/80" :
                        n.block_time_ms < 30000 ? "text-zinc-300" :
                        n.block_time_ms < 60000 ? "text-amber-400/80" : "text-red-400/80"
                      }>{(n.block_time_ms / 1000).toFixed(1)}s</span>
                    ) : <span className="text-zinc-700">—</span>}
                  </td>
                  <td className="py-2 px-5 text-right">
                    <StatusBadge status={n.is_orphaned ? "orphaned" : "—"} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
