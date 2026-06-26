"use client";
import { useLive } from "@/components/useLive";

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2.5">
      <p className="text-[9px] text-zinc-600 uppercase tracking-widest">{label}</p>
      <p className={`text-lg font-bold tabular-nums mt-0.5 ${color ?? "text-zinc-200"}`}>{value}</p>
    </div>
  );
}

export default function BlockProduction() {
  const { data } = useLive<any>("/api/node/production", 5000);
  const m = data?.mine;
  const net = data?.network;
  const configured = data?.configured;

  return (
    <div className="glass rounded-xl px-5 py-3 animate-in md:col-span-6 lg:col-span-6">
      <h3 className="text-[10px] text-zinc-500 uppercase tracking-widest font-medium py-2 mb-2 flex items-center">
        Block Production
      </h3>
      {!configured ? (
        <p className="text-xs text-zinc-500 py-2">
          Set <code className="text-zinc-300">NODE_LEADER_KEYS</code> to your node&apos;s leader public key to track the blocks it proposes.
        </p>
      ) : (m?.proposed ?? 0) === 0 ? (
        <p className="text-xs text-zinc-500 py-2">
          No blocks proposed yet. Your node proposes once it&apos;s fully synced and wins leadership (requires staked notes).
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-2.5 mb-3">
          <Stat label="Proposed" value={String(m.proposed)} />
          <Stat label="Final" value={String(m.final)} color="text-emerald-400/90" />
          <Stat label="Orphaned" value={String(m.orphaned)} color={m.orphaned > 0 ? "text-amber-400/90" : "text-zinc-200"} />
        </div>
      )}
      <div className="flex items-center justify-between pt-2 border-t border-white/[0.04] text-[11px] text-zinc-500">
        <span>My orphan rate</span>
        <span className="tabular-nums text-zinc-400">
          {data?.myOrphanRate != null ? `${data.myOrphanRate.toFixed(1)}%` : "—"}
        </span>
      </div>
      <div className="flex items-center justify-between pt-1.5 text-[11px] text-zinc-500">
        <span>Network orphan rate</span>
        <span className="tabular-nums text-zinc-400">
          {net?.orphanRate != null ? `${net.orphanRate.toFixed(2)}% (${net.orphaned}/${net.total})` : "—"}
        </span>
      </div>
    </div>
  );
}
