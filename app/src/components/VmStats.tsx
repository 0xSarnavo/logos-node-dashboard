"use client";
import { useLive } from "@/components/useLive";

function fmtBytes(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${u[i]}`;
}

function barColor(pct: number | null | undefined): string {
  if (pct == null) return "bg-zinc-600";
  if (pct >= 90) return "bg-rose-500/70";
  if (pct >= 75) return "bg-amber-500/70";
  return "bg-emerald-500/70";
}

function UsageRow({ label, pct, detail }: { label: string; pct: number | null; detail: string }) {
  return (
    <div className="py-2 px-2 -mx-2 rounded border-b border-white/[0.03]">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] text-zinc-600 uppercase tracking-widest font-medium">{label}</span>
        <span className="text-[11px] text-zinc-400 tabular-nums">{detail}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-white/[0.06] overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${barColor(pct)}`}
          style={{ width: `${Math.max(0, Math.min(100, pct ?? 0))}%` }}
        />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 py-2 px-2 -mx-2 rounded border-b border-white/[0.03]">
      <span className="text-[10px] text-zinc-600 uppercase tracking-widest font-medium w-28 flex-shrink-0">{label}</span>
      <span className="text-xs text-zinc-300 tabular-nums">{value}</span>
    </div>
  );
}

export default function VmStats() {
  const { data, error } = useLive<any>("/api/system", 5000);
  const cpu = data?.cpu;
  const mem = data?.mem;
  const disk = data?.disk;
  const load = data?.load;
  const pc = (v: number | null | undefined) => (v == null ? "—" : `${v.toFixed(0)}%`);

  return (
    <div className="glass rounded-xl px-5 py-3 animate-in md:col-span-6 lg:col-span-6">
      <h3 className="text-[10px] text-zinc-500 uppercase tracking-widest font-medium py-2 mb-1 flex items-center">
        Host Machine (VM)
      </h3>
      {error ? (
        <p className="text-xs text-zinc-600 py-3">Metrics unavailable.</p>
      ) : (
        <>
          <UsageRow
            label="CPU"
            pct={cpu?.usedPct ?? null}
            detail={`${pc(cpu?.usedPct)}${cpu?.stealPct != null && cpu.stealPct >= 1 ? ` · ${cpu.stealPct.toFixed(0)}% steal` : ""}`}
          />
          <UsageRow label="Memory" pct={mem?.usedPct ?? null} detail={`${fmtBytes(mem?.usedBytes)} / ${fmtBytes(mem?.totalBytes)}`} />
          <UsageRow
            label="Disk"
            pct={disk?.usedPct ?? null}
            detail={disk?.totalBytes != null ? `${fmtBytes(disk?.usedBytes)} / ${fmtBytes(disk?.totalBytes)}` : "—"}
          />
          <Row label="Load avg" value={load ? `${(load.l1 ?? 0).toFixed(2)} · ${(load.l5 ?? 0).toFixed(2)} · ${(load.l15 ?? 0).toFixed(2)}` : "—"} />
          <Row label="CPU cores" value={cpu?.cores != null ? String(cpu.cores) : "—"} />
        </>
      )}
    </div>
  );
}
