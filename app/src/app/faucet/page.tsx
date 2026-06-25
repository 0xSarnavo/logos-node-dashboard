"use client";
import { useState } from "react";
import { useLive } from "@/components/useLive";
import Chart from "@/components/Chart";
import MultiChart from "@/components/MultiChart";
import { truncHash } from "@/lib/format";
import AuthGate from "@/components/AuthGate";

function fmtDur(s: number) {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

// Time-range filter options for the faucet charts/stats. `ms` = window length (null = all time).
const FAUCET_RANGES: { id: string; label: string; ms: number | null }[] = [
  { id: "1h", label: "1h", ms: 60 * 60 * 1000 },
  { id: "6h", label: "6h", ms: 6 * 60 * 60 * 1000 },
  { id: "24h", label: "24h", ms: 24 * 60 * 60 * 1000 },
  { id: "7d", label: "7d", ms: 7 * 24 * 60 * 60 * 1000 },
  { id: "all", label: "All", ms: null },
];

// Find time windows within [start, end] that have no faucet activity. A gap is any span
// longer than `thresholdMs` between consecutive activity timestamps (and at the edges).
function findGaps(times: number[], start: number, end: number, thresholdMs: number) {
  const gaps: { from: number; to: number; durMs: number }[] = [];
  const pts = times.filter((t) => t >= start && t <= end).sort((a, b) => a - b);
  let prev = start;
  for (const t of pts) {
    if (t - prev > thresholdMs) gaps.push({ from: prev, to: t, durMs: t - prev });
    prev = t;
  }
  if (end - prev > thresholdMs) gaps.push({ from: prev, to: end, durMs: end - prev });
  return gaps;
}

export default function FaucetPage() {
  return (
    <AuthGate>
      <FaucetContent />
    </AuthGate>
  );
}

function FaucetContent() {
  const { data: info } = useLive<any>("/api/faucet", 15000);
  const { data: worker, mutate } = useLive<any>("/api/faucet/worker", 3000);
  const [range, setRange] = useState("24h");
  const [gap, setGap] = useState(12);
  const [maxGrants, setMaxGrants] = useState(0);
  const [selectedKeys, setSelectedKeys] = useState<Record<string, boolean>>({});
  const [customKey, setCustomKey] = useState("");
  const [extraKeys, setExtraKeys] = useState<string[]>([]);
  const [deletePrev, setDeletePrev] = useState(true);

  const allKeys = [...(info?.keys?.map((k: any) => k.key) || []), ...extraKeys];
  const activeKeys = allKeys.filter(k => selectedKeys[k] !== false);
  const isRunning = worker?.running ?? false;

  const toggleKey = (key: string) => setSelectedKeys(prev => ({ ...prev, [key]: !(prev[key] ?? true) }));
  const isKeyActive = (key: string) => selectedKeys[key] !== false;

  const startWorker = async () => {
    if (activeKeys.length === 0) return;
    await fetch("/api/faucet/worker", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start", keys: activeKeys, gap, max_grants: maxGrants, delete_previous: deletePrev }),
    });
    mutate();
  };

  const stopWorker = async () => {
    await fetch("/api/faucet/worker", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "stop" }),
    });
    mutate();
  };

  const addCustomKey = () => {
    const k = customKey.trim();
    if (k.length === 64 && /^[a-f0-9]+$/i.test(k) && !allKeys.includes(k)) {
      setExtraKeys(prev => [...prev, k]);
      setSelectedKeys(prev => ({ ...prev, [k]: true }));
      setCustomKey("");
    }
  };

  const session = worker?.session;
  const logs = worker?.recent_logs || [];
  const allSeries: any[] = worker?.series || [];

  // Time-range filter: keep only series buckets within the selected window (client-side).
  const rangeDef = FAUCET_RANGES.find((r) => r.id === range) ?? FAUCET_RANGES[2];
  const now = Date.now();
  const windowStart = rangeDef.ms != null ? now - rangeDef.ms : 0;
  const series = rangeDef.ms == null
    ? allSeries
    : allSeries.filter((s) => new Date(s.time).getTime() >= windowStart);

  const elapsed = session?.started_at ? Math.floor((Date.now() - new Date(session.started_at).getTime()) / 1000) : 0;
  const totalSeriesCalls = series.reduce((a, s) => a + s.calls, 0);
  const avgLatency = totalSeriesCalls > 0
    ? Math.round(series.reduce((a, s) => a + s.latency * s.calls, 0) / totalSeriesCalls)
    : null;

  // Gaps view: time windows in the selected range that saw NO faucet activity (no API calls).
  // We use the per-minute buckets that recorded at least one call as "activity" markers.
  const activityTimes = series.filter((s) => (s.calls ?? 0) > 0).map((s) => new Date(s.time).getTime());
  const seriesTimes = series.map((s) => new Date(s.time).getTime());
  const gapStart = rangeDef.ms != null ? windowStart : (seriesTimes.length ? Math.min(...seriesTimes) : now);
  // A gap = a no-activity span longer than ~3 bucket-widths (3 min) so brief pauses aren't flagged.
  const GAP_THRESHOLD_MS = 3 * 60 * 1000;
  const gaps = series.length > 0 ? findGaps(activityTimes, gapStart, now, GAP_THRESHOLD_MS) : [];
  const fmtClock = (t: number) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  // Group logs by wallet so each wallet gets its own log box
  const logsByWallet: Record<string, any[]> = {};
  for (const log of logs) (logsByWallet[log.wallet_key] ||= []).push(log);

  // Order: active keys first (selection order), then any other wallet that has logs
  const walletOrder: string[] = [];
  for (const k of allKeys) if (!walletOrder.includes(k)) walletOrder.push(k);
  for (const k of Object.keys(logsByWallet)) if (!walletOrder.includes(k)) walletOrder.push(k);

  // Show a box for a wallet if it has logs, or if it's an active key while running
  const walletBoxes = walletOrder.filter(k => (logsByWallet[k]?.length ?? 0) > 0 || (isRunning && isKeyActive(k)));
  const gridCols = walletBoxes.length <= 1 ? "grid-cols-1"
    : walletBoxes.length === 2 ? "grid-cols-1 lg:grid-cols-2"
    : "grid-cols-1 md:grid-cols-2 xl:grid-cols-3";

  return (
    <div className="px-6 py-5 mx-auto pb-14">
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <h1 className="text-xl font-bold tracking-tight">Faucet</h1>
        {isRunning && (
          <span className="flex items-center gap-1.5 text-[11px] text-emerald-400/80">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/70 live-dot" />
            Running server-side — safe to close browser
          </span>
        )}
        {/* Time-range filter — drives the session charts, stats, and gaps below. */}
        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-medium mr-1">Range</span>
          {FAUCET_RANGES.map((r) => (
            <button
              key={r.id}
              onClick={() => setRange(r.id)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${range === r.id ? "bg-white/10 text-white" : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]"}`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        {/* Settings */}
        <div className="glass rounded-xl p-4">
          <h3 className="text-[10px] text-zinc-500 uppercase tracking-widest font-medium mb-3">Settings</h3>
          <div className="space-y-3">
            <div>
              <label className="text-[10px] text-zinc-500 uppercase tracking-widest block mb-1.5">Wallets</label>
              {allKeys.map(key => {
                const ki = info?.keys?.find((k: any) => k.key === key);
                return (
                  <label key={key} className="flex items-center gap-2 py-1 cursor-pointer group">
                    <input type="checkbox" checked={isKeyActive(key)} onChange={() => toggleKey(key)} disabled={isRunning}
                      className="rounded border-zinc-600 bg-transparent accent-emerald-500" />
                    <span className="hash text-[10px] text-zinc-400 group-hover:text-white transition-colors flex-1">
                      {key.slice(0, 8)}…{key.slice(-4)}
                    </span>
                    <span className="text-[9px] text-zinc-600 tabular-nums">{ki?.balance?.toLocaleString() ?? "—"}</span>
                  </label>
                );
              })}
              <div className="flex gap-1.5 mt-2">
                <input type="text" value={customKey} onChange={e => setCustomKey(e.target.value)}
                  placeholder="Paste key (64 hex)"
                  className="flex-1 bg-white/[0.03] border border-white/[0.06] rounded px-2 py-1 text-[10px] text-zinc-300 hash focus:outline-none"
                  onKeyDown={e => e.key === "Enter" && addCustomKey()} />
                <button onClick={addCustomKey} className="px-2 py-1 border border-white/[0.06] rounded text-[10px] text-zinc-400 hover:text-white transition-colors">+</button>
              </div>
            </div>

            <div>
              <label className="text-[10px] text-zinc-500 uppercase tracking-widest block mb-1">Gap (seconds)</label>
              <input type="number" min={3} max={120} value={gap} onChange={e => setGap(parseInt(e.target.value) || 12)} disabled={isRunning}
                className="w-full bg-white/[0.03] border border-white/[0.06] rounded px-2 py-1.5 text-[11px] text-zinc-300 tabular-nums focus:outline-none disabled:opacity-50" />
            </div>

            <div>
              <label className="text-[10px] text-zinc-500 uppercase tracking-widest block mb-1">Max Grants (0 = unlimited)</label>
              <input type="number" min={0} value={maxGrants} onChange={e => setMaxGrants(parseInt(e.target.value) || 0)} disabled={isRunning}
                className="w-full bg-white/[0.03] border border-white/[0.06] rounded px-2 py-1.5 text-[11px] text-zinc-300 tabular-nums focus:outline-none disabled:opacity-50" />
            </div>

            {!isRunning && (
              <label className="flex items-center gap-2 text-[10px] text-zinc-500 cursor-pointer">
                <input type="checkbox" checked={deletePrev} onChange={e => setDeletePrev(e.target.checked)}
                  className="rounded border-zinc-600 bg-transparent accent-red-500" />
                Delete previous session logs
              </label>
            )}

            <div className="pt-1">
              {!isRunning ? (
                <button onClick={startWorker} disabled={activeKeys.length === 0}
                  className="w-full py-2 bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded-lg text-[12px] font-medium hover:bg-emerald-500/30 transition-colors disabled:opacity-30">
                  Start ({activeKeys.length} key{activeKeys.length !== 1 ? "s" : ""})
                </button>
              ) : (
                <button onClick={stopWorker}
                  className="w-full py-2 bg-red-500/20 border border-red-500/30 text-red-400 rounded-lg text-[12px] font-medium hover:bg-red-500/30 transition-colors">
                  Stop
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="glass rounded-xl p-4">
          <h3 className="text-[10px] text-zinc-500 uppercase tracking-widest font-medium mb-3 flex items-center gap-1.5">
            {isRunning ? <><span className="w-1.5 h-1.5 rounded-full bg-emerald-500/70 live-dot" />Current Session #{session?.id ?? "—"}</> : session ? `Last Session #${session.id} (stopped)` : "Session"}
          </h3>
          <div className="space-y-2 text-[12px]">
            <div className="flex justify-between"><span className="text-zinc-500">Time running</span><span className="tabular-nums font-medium">{session?.started_at ? fmtDur(elapsed) : "—"}</span></div>
            <div className="flex justify-between"><span className="text-zinc-500">API calls made</span><span className="tabular-nums">{(session?.total_calls ?? 0).toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-zinc-500">Grants won</span><span className="tabular-nums font-medium text-emerald-400/90">{session?.total_grants ?? 0} · +{((session?.tokens_earned ?? 0)).toLocaleString()} tokens</span></div>
            <div className="flex justify-between"><span className="text-zinc-500">Duplicate replies</span><span className="tabular-nums text-zinc-400">{(session?.total_dups ?? 0).toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-zinc-500">Rate-limited (429)</span><span className={`tabular-nums ${(session?.total_429s ?? 0) > 0 ? "text-amber-400/80" : ""}`}>{session?.total_429s ?? 0}</span></div>
            <div className="flex justify-between"><span className="text-zinc-500">Errors</span><span className={`tabular-nums ${(session?.total_errors ?? 0) > 0 ? "text-red-400/80" : ""}`}>{session?.total_errors ?? 0}</span></div>
            <div className="flex justify-between"><span className="text-zinc-500">Avg response time</span><span className="tabular-nums">{avgLatency != null ? `${avgLatency} ms` : "—"}</span></div>
            <div className="flex justify-between"><span className="text-zinc-500">Wallets · gap</span><span className="tabular-nums">{worker?.keys?.length ?? activeKeys.length} · every {worker?.gap ?? gap}s</span></div>
          </div>

          {worker?.lifetime && (
            <div className="mt-3 pt-3 border-t border-white/[0.04]">
              <p className="text-[9px] text-zinc-600 uppercase tracking-widest mb-2">All-time totals</p>
              <div className="space-y-1.5 text-[11px]">
                <div className="flex justify-between"><span className="text-zinc-600">Grants won</span><span className="tabular-nums">{parseInt(worker.lifetime.total_grants).toLocaleString()}</span></div>
                <div className="flex justify-between"><span className="text-zinc-600">Tokens earned</span><span className="tabular-nums">{parseInt(worker.lifetime.total_tokens).toLocaleString()}</span></div>
              </div>
            </div>
          )}
        </div>

        {/* Balances */}
        <div className="glass rounded-xl p-4">
          <h3 className="text-[10px] text-zinc-500 uppercase tracking-widest font-medium mb-3">Wallet Balances</h3>
          <div className="space-y-3">
            {(info?.keys || []).map((k: any) => (
              <div key={k.key} className="flex justify-between items-center">
                <div className="min-w-0">
                  <p className="hash text-[11px] text-zinc-300 truncate">{k.short}</p>
                  <p className="text-[9px] text-zinc-600">{k.notes} notes</p>
                </div>
                <div className="text-right">
                  <p className="text-[15px] font-bold tabular-nums leading-none">{k.balance?.toLocaleString() ?? "—"}</p>
                  <p className="text-[9px] text-zinc-600 mt-1">tokens</p>
                </div>
              </div>
            ))}
            <div className="border-t border-white/[0.04] pt-2.5 flex justify-between items-center">
              <span className="text-zinc-500 text-[11px]">Total balance</span>
              <span className="text-[15px] font-bold tabular-nums">{info?.total_balance?.toLocaleString() ?? "—"} <span className="text-[9px] text-zinc-600 font-normal">tokens</span></span>
            </div>
          </div>

          {worker?.sessions?.length > 0 && (
            <div className="mt-3 pt-3 border-t border-white/[0.04]">
              <p className="text-[9px] text-zinc-600 uppercase tracking-widest mb-2">Past sessions</p>
              <div className="space-y-1 max-h-[80px] overflow-y-auto">
                {worker.sessions.map((s: any) => (
                  <div key={s.id} className="flex justify-between text-[10px]">
                    <span className="text-zinc-600">#{s.id} {s.is_active ? <span className="text-emerald-400/70">live</span> : ""}</span>
                    <span className="tabular-nums text-zinc-400">{s.total_grants} grants · +{s.tokens_earned?.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Session graphs */}
      {series.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
          <div className="glass rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[10px] text-zinc-500 uppercase tracking-widest font-medium">API Calls / min</h3>
              <span className="text-[11px] text-zinc-500 tabular-nums">{(session?.total_calls ?? 0).toLocaleString()} total</span>
            </div>
            <Chart data={series.map((s) => ({ time: s.time, value: s.calls }))} type="bar" color="#a1a1aa" height={170} />
          </div>
          <div className="glass rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[10px] text-zinc-500 uppercase tracking-widest font-medium">Grants vs Duplicates / min</h3>
              <span className="text-[11px] text-zinc-500 tabular-nums">{session?.total_grants ?? 0} grants · {session?.total_dups ?? 0} dup</span>
            </div>
            <MultiChart
              data={series.map((s) => ({ time: s.time, Grants: s.grants, Duplicates: s.dups, "429s": s.rate_limited }))}
              series={[
                { key: "Grants", color: "#34d399", label: "Grants" },
                { key: "Duplicates", color: "#71717a", label: "Duplicates" },
                { key: "429s", color: "#fbbf24", label: "429s" },
              ]}
              height={170}
            />
          </div>
          <div className="glass rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[10px] text-zinc-500 uppercase tracking-widest font-medium">Response Time</h3>
              <span className="text-[11px] text-zinc-500 tabular-nums">{avgLatency != null ? `${avgLatency} ms avg` : "—"}</span>
            </div>
            <Chart data={series.map((s) => ({ time: s.time, value: s.latency }))} color="#ffffff" unit="ms" height={170} />
          </div>
        </div>
      )}

      {/* Gaps — periods within the selected range with no faucet activity */}
      {series.length > 0 && (
        <div className="glass rounded-xl p-4 mb-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[10px] text-zinc-500 uppercase tracking-widest font-medium">
              Activity Gaps <span className="text-zinc-600">· {rangeDef.label}</span>
            </h3>
            <span className="text-[11px] text-zinc-500 tabular-nums">
              {gaps.length === 0 ? "no gaps" : `${gaps.length} gap${gaps.length !== 1 ? "s" : ""}`}
            </span>
          </div>

          {/* Timeline bar: shaded segments mark no-activity windows across the range. */}
          <div className="relative h-6 rounded-md bg-emerald-500/[0.08] overflow-hidden mb-3 border border-white/[0.04]">
            {(() => {
              const spanStart = gapStart;
              const spanEnd = now;
              const span = Math.max(1, spanEnd - spanStart);
              return gaps.map((g, i) => {
                const left = ((g.from - spanStart) / span) * 100;
                const width = ((g.to - g.from) / span) * 100;
                return (
                  <div
                    key={i}
                    className="absolute inset-y-0 bg-amber-500/30"
                    style={{ left: `${left}%`, width: `${Math.max(0.5, width)}%` }}
                    title={`No activity ${fmtClock(g.from)} → ${fmtClock(g.to)} (${fmtDur(Math.round(g.durMs / 1000))})`}
                  />
                );
              });
            })()}
          </div>
          <div className="flex items-center gap-3 text-[9px] text-zinc-600 mb-3">
            <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-[1px] bg-emerald-500/30" /> active</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-[1px] bg-amber-500/40" /> gap (no grants)</span>
          </div>

          {gaps.length === 0 ? (
            <p className="text-[12px] text-zinc-600">Continuous activity across this range — no idle periods detected.</p>
          ) : (
            <div className="space-y-1 max-h-[160px] overflow-y-auto">
              {gaps.map((g, i) => (
                <div key={i} className="flex items-center justify-between text-[11px] py-1 border-b border-white/[0.03] last:border-0">
                  <span className="tabular-nums text-zinc-400">{fmtClock(g.from)} → {fmtClock(g.to)}</span>
                  <span className="tabular-nums text-amber-400/70">{fmtDur(Math.round(g.durMs / 1000))}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Activity Log — one box per wallet */}
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-[10px] text-zinc-500 uppercase tracking-widest font-medium">Activity Log</h2>
        {isRunning && (
          <span className="flex items-center gap-1.5 text-[10px] text-emerald-400/50">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/70 live-dot" />
            live — updates every 3s
          </span>
        )}
      </div>

      {walletBoxes.length === 0 ? (
        <div className="glass rounded-xl px-4 py-10 text-center text-[12px] text-zinc-600">
          Start the faucet to begin. Runs server-side — safe to close browser.
        </div>
      ) : (
        <div className={`grid ${gridCols} gap-4 items-start`}>
          {walletBoxes.map(key => {
            const wlogs = logsByWallet[key] || [];
            const ki = info?.keys?.find((k: any) => k.key === key);
            const short = ki?.short || `${key.slice(0, 8)}…${key.slice(-4)}`;
            const grants = wlogs.filter((l: any) => l.is_new_grant).length;
            const earned = wlogs.filter((l: any) => l.is_new_grant).reduce((a: number, l: any) => a + (l.amount || 0), 0);
            return (
              <div key={key} className="glass rounded-xl overflow-hidden flex flex-col">
                <div className="px-4 py-2.5 flex items-center justify-between gap-2">
                  <h3 className="flex items-center gap-1.5 min-w-0 text-[11px] font-medium">
                    {isRunning && isKeyActive(key) && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/70 live-dot shrink-0" />}
                    <span className="hash text-zinc-300 truncate">{short}</span>
                    <span className="text-zinc-600 tabular-nums shrink-0">({wlogs.length})</span>
                  </h3>
                  <span className="flex items-center gap-2.5 text-[10px] tabular-nums shrink-0">
                    {grants > 0 && <span className="text-emerald-400/70">{grants} grant{grants !== 1 ? "s" : ""} · +{earned.toLocaleString()}</span>}
                    {ki?.balance != null && <span className="text-zinc-500">{ki.balance.toLocaleString()} tokens</span>}
                  </span>
                </div>
                <div className="glow-separator" />
                <div className="max-h-[360px] overflow-y-auto">
                  {wlogs.length === 0 ? (
                    <div className="px-4 py-8 text-center text-[12px] text-zinc-600">Waiting for first response…</div>
                  ) : (
                    <table className="w-full text-[11px] data-table">
                      <thead className="sticky top-0 bg-black/90 backdrop-blur-sm">
                        <tr className="text-[9px] text-zinc-600 uppercase tracking-widest">
                          <th className="text-left py-2 px-3 font-medium">Time</th>
                          <th className="text-left py-2 px-3 font-medium">Status</th>
                          <th className="text-right py-2 px-3 font-medium">Took</th>
                          <th className="text-left py-2 px-3 font-medium">Hash</th>
                          <th className="text-right py-2 px-3 font-medium">Result</th>
                        </tr>
                      </thead>
                      <tbody>
                        {wlogs.map((log: any, i: number) => (
                          <tr key={i} className={log.is_new_grant ? "row-new" : ""}>
                            <td className="py-1.5 px-3 tabular-nums text-zinc-500">
                              {new Date(log.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                            </td>
                            <td className="py-1.5 px-3">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                log.status_code === 200 ? "bg-emerald-500/10 text-emerald-400/70" :
                                log.status_code === 429 ? "bg-amber-500/10 text-amber-400/70" :
                                "bg-red-500/10 text-red-400/70"
                              }`}>{log.status_code || "err"}</span>
                            </td>
                            <td className="py-1.5 px-3 text-right tabular-nums text-zinc-500">{log.latency_ms != null ? `${log.latency_ms}ms` : "—"}</td>
                            <td className="py-1.5 px-3 hash text-zinc-400">{log.tx_hash ? truncHash(log.tx_hash) : log.error || "—"}</td>
                            <td className="py-1.5 px-3 text-right">
                              {log.is_new_grant ? (
                                <span className="text-emerald-400/70 text-[10px] font-medium">+{log.amount?.toLocaleString()}</span>
                              ) : log.status_code === 429 ? (
                                <span className="text-amber-400/70 text-[10px]">429</span>
                              ) : log.status_code === 200 ? (
                                <span className="text-zinc-500 text-[10px]">duplicate</span>
                              ) : (
                                <span className="text-red-400/60 text-[10px]">fail</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
