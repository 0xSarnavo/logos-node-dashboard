"use client";
import { useState, type ReactNode } from "react";
import Chart from "@/components/Chart";
import MultiChart from "@/components/MultiChart";
import { useLive } from "@/components/useLive";
import { SkeletonRows } from "@/components/Skeleton";
import { InfoTip } from "@/components/InfoTip";
import { RANGES } from "@/lib/ranges";

function fmtDur(s: number | null) {
  if (s == null) return "—";
  s = Math.round(s);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

// Status palette — color ONLY ever denotes good/warn/bad. Everything else is white.
type Health = "ok" | "warn" | "bad";
function statusText(state: Health) {
  return state === "ok" ? "text-emerald-400" : state === "warn" ? "text-amber-400" : "text-rose-400";
}

const TILE_LABEL = "text-[9px] text-zinc-600 uppercase tracking-widest font-medium";

function SyncRing({ percent, caughtUp }: { percent: number; caughtUp: boolean }) {
  const p = Math.min(100, Math.max(0, percent));
  return (
    <div className="relative w-32 h-32 flex-shrink-0">
      <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
        <circle cx="18" cy="18" r="15.9" fill="none" className="sync-ring-track" strokeWidth="2.5" />
        <circle cx="18" cy="18" r="15.9" fill="none"
          stroke={caughtUp ? "rgba(52,211,153,0.7)" : "rgba(251,191,36,0.6)"}
          strokeWidth="2.5" strokeDasharray={`${p} ${100 - p}`} strokeLinecap="round"
          className="transition-all duration-1000" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold tabular-nums">{p >= 99.99 ? "100" : p.toFixed(1)}%</span>
        <span className="text-[9px] text-zinc-500 uppercase tracking-widest">synced</span>
      </div>
    </div>
  );
}

// Bento number tile — clean card, white by default (value color set by caller only for status).
function Tile({ span, children }: { span: string; children: ReactNode }) {
  return (
    <div className={`stat-card rounded-xl p-3.5 animate-in ${span}`}>{children}</div>
  );
}

// Bento chart box.
function ChartCard({ title, tip, tipAlign, value, span, children }: { title: string; tip?: string; tipAlign?: "left" | "right"; value?: ReactNode; span: string; children: ReactNode }) {
  return (
    <div className={`glass rounded-xl p-4 animate-in ${span}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[10px] text-zinc-500 uppercase tracking-widest font-medium flex items-center">{title}{tip && <InfoTip text={tip} align={tipAlign} />}</h3>
        {value != null && <span className="text-[11px] text-zinc-400 tabular-nums">{value}</span>}
      </div>
      {children}
    </div>
  );
}

function HeroStat({ label, value, tip }: { label: string; value: ReactNode; tip?: string }) {
  return (
    <div>
      <p className="text-[9px] text-zinc-600 uppercase tracking-widest flex items-center">{label}{tip && <InfoTip text={tip} />}</p>
      <p className="font-bold tabular-nums mt-0.5">{value}</p>
    </div>
  );
}

function HealthLine({ state, label, sub, tip }: { state: Health; label: string; sub: string; tip?: string }) {
  const dot = state === "ok" ? "bg-emerald-500/70 live-dot" : state === "warn" ? "bg-amber-500/70" : "bg-rose-500/70";
  return (
    <div className="flex items-center gap-2.5">
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`} />
      <div className="min-w-0">
        <p className="text-xs font-medium flex items-center">{label}{tip && <InfoTip text={tip} align="right" />}</p>
        <p className="text-[10px] text-zinc-600 truncate">{sub}</p>
      </div>
    </div>
  );
}

function InfoRow({ label, value, mono, tip, tipAlign }: { label: string; value: string; mono?: boolean; tip?: string; tipAlign?: "left" | "right" }) {
  return (
    <div className="flex items-start gap-3 py-2 px-2 -mx-2 rounded border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
      <span className="text-[10px] text-zinc-600 uppercase tracking-widest font-medium w-28 flex-shrink-0 pt-0.5 flex items-center">{label}{tip && <InfoTip text={tip} align={tipAlign} />}</span>
      <span className={`text-xs text-zinc-300 break-all ${mono ? "hash" : ""}`}>{value}</span>
    </div>
  );
}

function WalletStatusBadge({ status }: { status: string }) {
  if (status === "funded") return <span className="badge badge-confirmed">funded</span>;
  if (status === "empty") return <span className="badge badge-pending">empty</span>;
  return <span className="badge badge-orphaned">unreachable</span>;
}

export default function MyNodePage() {
  const [range, setRange] = useState("1h");
  const { data: node } = useLive<any>("/api/node", 3000);
  const { data: walletData } = useLive<any>("/api/wallet", 10000);
  const { data: self } = useLive<any>("/api/peers/self", 120000);
  const { data: heightHistory } = useLive<any[]>(`/api/chain/history?metric=height&range=${range}`, 10000);
  const { data: blockTimeHistory } = useLive<any[]>(`/api/chain/history?metric=block_time&range=${range}`, 10000);
  const { data: finalityHistory } = useLive<any[]>(`/api/chain/history?metric=finality&range=${range}`, 10000);
  const { data: networkHistory } = useLive<any[]>(`/api/network?range=${range}`, 10000);
  const { data: bpmHistory } = useLive<any[]>(`/api/chain/history?metric=blocks_per_5m&range=${range}`, 30000);

  const c = node?.chain;
  const sy = node?.sync;
  const n = node?.network;
  const s = node?.stats;
  const online = c?.mode === "Online";
  const caughtUp = sy?.caught_up ?? false;

  const trackingMinutes = s?.tracking_since ? Math.round((Date.now() - new Date(s.tracking_since).getTime()) / 60000) : 0;

  // Master node state — drives the header chip.
  const state: Health = !online ? "bad" : caughtUp ? "ok" : "warn";
  const stateLabel = state === "ok" ? "Online / In Sync" : state === "warn" ? "Catching Up" : "Offline";
  const stateDot = state === "ok" ? "bg-emerald-500/70" : state === "warn" ? "bg-amber-500/70" : "bg-rose-500/70";
  const stateText = state === "ok" ? "text-emerald-400/80" : state === "warn" ? "text-amber-400/80" : "text-rose-400/70";

  // Health states — reused for both the Health box and the status-colored tiles.
  const peers = n?.peers ?? 0;
  const peerState: Health = peers >= 5 ? "ok" : peers > 0 ? "warn" : "bad";
  const lag = c?.finality_lag ?? 9999;
  const finState: Health = lag < 1000 ? "ok" : lag < 5000 ? "warn" : "bad";
  const prodState: Health = (s?.blocks_1h ?? 0) > 0 ? "ok" : "bad";

  const peersData = (networkHistory ?? []).map((d: any) => ({ time: d.time, Peers: d.peers, Connections: d.connections }));

  return (
    <div className="px-6 py-5 mx-auto pb-10">
      {/* Status header — plain strip above the bento */}
      <div className="flex items-center gap-3 mb-4">
        <h1 className="text-2xl font-bold tracking-tight">My Node</h1>
        <span className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full live-dot ${stateDot}`} />
          <span className={`text-xs font-medium ${stateText}`}>{stateLabel}</span>
        </span>
        <span className="ml-auto text-[10px] text-zinc-600">tracking for {fmtDur(trackingMinutes * 60)}</span>
      </div>

      {/* Bento grid */}
      <div className="grid grid-cols-1 md:grid-cols-6 lg:grid-cols-12 gap-4">
        {/* Chain Sync — hero */}
        <div className="glass rounded-xl p-5 md:col-span-6 lg:col-span-8 animate-in">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[10px] text-zinc-500 uppercase tracking-widest font-medium flex items-center">Chain Sync<InfoTip text="How caught up your node is with the rest of the network. 100% means it has every block." /></h3>
            <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
              online ? "text-emerald-400/80 border-emerald-500/20 bg-emerald-500/[0.06]" : "text-rose-400/70 border-rose-500/20"
            }`}>{c?.mode ?? "—"}</span>
          </div>
          <div className="flex flex-col sm:flex-row gap-5 sm:gap-6 sm:items-center">
            <SyncRing percent={sy?.percent ?? 0} caughtUp={caughtUp} />
            <div className="flex-1 min-w-0">
              <p className={`text-sm mb-4 ${caughtUp ? "text-emerald-400/70" : "text-amber-400/70"}`}>
                {caughtUp ? "Following the live chain" : sy?.seconds_behind != null ? `${fmtDur(sy.seconds_behind)} behind the network` : "Measuring..."}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-5 gap-y-3 text-xs">
                <HeroStat label="Block Height" value={c?.height?.toLocaleString() ?? "—"} tip="How many blocks tall the chain is — the latest block's number." />
                <HeroStat label="Tip Slot" value={<>{c?.slot?.toLocaleString() ?? "—"} <span className="text-zinc-600 font-normal">/ {sy?.live_slot?.toLocaleString() ?? "—"}</span></>} tip="The newest time-slot your node has reached vs. the network's current live slot. Each slot is ~1 second." />
                <HeroStat label="Slots Behind" value={sy?.slots_behind?.toLocaleString() ?? "—"} tip="How far behind the live network your node is, in 1-second slots. 0 = fully caught up." />
                <HeroStat label="Sync Speed" value={sy?.slot_rate != null ? `${sy.slot_rate} slots/s` : "—"} tip="How fast your node is catching up, in slots per second. 0 when already in sync." />
                <HeroStat label="ETA" value={caughtUp ? "caught up" : sy?.eta_seconds ? `~${fmtDur(sy.eta_seconds)}` : "measuring..."} tip="Estimated time left until your node is fully caught up." />
                <HeroStat label="LIB Slot" value={c?.lib_slot?.toLocaleString() ?? "—"} tip="Last Irreversible Block slot — the newest block that can never be undone." />
              </div>
            </div>
          </div>
        </div>

        {/* Node Health */}
        <div className="glass rounded-xl p-5 md:col-span-6 lg:col-span-4 animate-in" style={{ animationDelay: "0.05s" }}>
          <h3 className="text-[10px] text-zinc-500 uppercase tracking-widest font-medium mb-4 flex items-center">Node Health<InfoTip text="Quick green / yellow / red checks. Green = good, yellow = needs attention, red = problem." align="right" /></h3>
          <div className="space-y-4">
            <HealthLine state={state} label="Sync" sub={c?.mode ?? "—"} tip="Is the node online and following the chain?" />
            <HealthLine state={peerState} label="Peers" sub={`${peers} connected`} tip="Are enough other nodes connected? (at least 5 is healthy)" />
            <HealthLine state={finState} label="Finality" sub={`${c?.finality_lag ?? "—"} slots lag · avg ${s?.avg_finality ?? "—"}`} tip="Is the chain locking in blocks as permanent quickly enough?" />
            <HealthLine state={prodState} label="Production" sub={`${s?.blocks_1h ?? 0} blocks/h`} tip="Are new blocks being produced on the network?" />
          </div>
        </div>

        {/* Number-tile band — color only where it denotes status; otherwise white */}
        <Tile span="md:col-span-2 lg:col-span-2">
          <p className={`${TILE_LABEL} mb-1.5 flex items-center`}>Peers<InfoTip text="Other nodes (computers) your node is directly connected to on the network. (The node API reports a single connection count — it doesn't split inbound vs outbound.)" /></p>
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className={`text-2xl font-bold tabular-nums leading-none ${statusText(peerState)}`}>{n?.peers ?? "—"}</span>
            <span className="text-[10px] text-zinc-600">{n?.connections ?? "—"} conn · {n?.pending ?? 0} pending</span>
          </div>
          <p className="text-[10px] text-zinc-600 mt-2">avg {s?.avg_peers ?? "—"}p · {s?.min_peers ?? "—"}–{s?.max_peers ?? "—"} range</p>
        </Tile>

        <Tile span="md:col-span-2 lg:col-span-2">
          <p className={`${TILE_LABEL} mb-1.5 flex items-center`}>Transactions<InfoTip text="Total decoded transactions across all indexed blocks, and how many blocks carried at least one." /></p>
          <p className="text-2xl font-bold tabular-nums leading-none text-white">{s?.total_txs?.toLocaleString() ?? "—"}</p>
          <p className="text-[10px] text-zinc-600 mt-2">{s?.blocks_with_txs?.toLocaleString() ?? "—"} blocks with tx</p>
        </Tile>

        <Tile span="md:col-span-2 lg:col-span-2">
          <p className={`${TILE_LABEL} mb-1.5 flex items-center`}>Avg Block Time<InfoTip text="Average gap between new blocks over the last 30 min. Lower means faster blocks." /></p>
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-2xl font-bold tabular-nums leading-none text-white">{s?.avg_bt != null ? `${s.avg_bt}s` : "—"}</span>
            <span className="text-[10px] text-zinc-600">min {s?.min_bt ?? "—"}s · max {s?.max_bt ?? "—"}s</span>
          </div>
          <p className="text-[10px] text-zinc-600 mt-2">1h range</p>
        </Tile>

        <Tile span="md:col-span-2 lg:col-span-2">
          <p className={`${TILE_LABEL} mb-1.5 flex items-center`}>Finality Lag<InfoTip text="How many slots behind the last permanent (irreversible) block you are. Smaller is healthier." align="right" /></p>
          <p className={`text-xl font-bold tabular-nums leading-none ${statusText(finState)}`}>{c?.finality_lag ?? "—"}<span className="text-xs text-zinc-600 font-normal ml-1">slots</span></p>
          <p className="text-[10px] text-zinc-600 mt-2">avg {s?.avg_finality ?? "—"} slots</p>
        </Tile>

        <Tile span="md:col-span-2 lg:col-span-2">
          <p className={`${TILE_LABEL} mb-1.5 flex items-center`}>Blocks / 1h<InfoTip text="How many blocks the chain produced in the last hour." align="right" /></p>
          <p className={`text-xl font-bold tabular-nums leading-none ${statusText(prodState)}`}>{s?.blocks_1h ?? "—"}</p>
          <p className="text-[10px] text-zinc-600 mt-2">{s?.blocks_24h?.toLocaleString() ?? "—"} in 24h</p>
        </Tile>

        <Tile span="md:col-span-2 lg:col-span-2">
          <p className={`${TILE_LABEL} mb-1.5 flex items-center`}>Indexed Blocks<InfoTip text="Total blocks this dashboard has saved in its own database." align="right" /></p>
          <p className="text-xl font-bold tabular-nums leading-none text-white">{s?.total_blocks?.toLocaleString() ?? "—"}</p>
          <p className="text-[10px] text-zinc-600 mt-2">{s?.total_events?.toLocaleString() ?? "—"} events</p>
        </Tile>

        {/* Chart time-range selector — drives all charts below */}
        <div className="md:col-span-6 lg:col-span-12 flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-medium mr-1">Range</span>
          {RANGES.map((r) => (
            <button
              key={r.id}
              onClick={() => setRange(r.id)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${range === r.id ? "bg-white/10 text-white" : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]"}`}
            >
              {r.label}
            </button>
          ))}
        </div>

        {/* Trend charts — one box per metric (no toggle), each its own fitting chart type */}
        <ChartCard title="Block Height" tip="Chain height over time — it should steadily climb." value={c?.height?.toLocaleString()} span="md:col-span-6 lg:col-span-8">
          <Chart data={heightHistory ?? []} color="#ffffff" height={210} />
        </ChartCard>

        <ChartCard title="Peers" tip="Connected peers (white) and total connections (grey) over time." tipAlign="right" value={n?.peers ?? undefined} span="md:col-span-6 lg:col-span-4">
          <MultiChart
            data={peersData}
            series={[
              { key: "Peers", color: "#ffffff", label: "Peers" },
              { key: "Connections", color: "#52525b", label: "Connections" },
            ]}
            height={210}
          />
        </ChartCard>

        <ChartCard title="Block Time" tip="Seconds between blocks over time. Taller bar = slower block." value={s?.avg_bt != null ? `${s.avg_bt}s` : undefined} span="md:col-span-3 lg:col-span-4">
          <Chart data={blockTimeHistory ?? []} type="bar" color="#d4d4d8" unit="s" height={165} />
        </ChartCard>

        <ChartCard title="Finality" tip="Finality lag over time — how many slots behind the last permanent block." value={c?.finality_lag != null ? `${c.finality_lag} slots` : undefined} span="md:col-span-3 lg:col-span-4">
          <Chart data={finalityHistory ?? []} color="#ffffff" unit="slots" height={165} />
        </ChartCard>

        <ChartCard title="Production" tip="Blocks produced in each 5-minute window." tipAlign="right" value={s?.blocks_1h != null ? `${s.blocks_1h}/h` : undefined} span="md:col-span-6 lg:col-span-4">
          <Chart data={bpmHistory ?? []} type="bar" color="#d4d4d8" height={165} />
        </ChartCard>

        {/* Wallets */}
        <div className="glass rounded-xl overflow-hidden animate-in md:col-span-6 lg:col-span-12">
          <div className="flex items-center justify-between px-5 py-3">
            <div className="flex items-center gap-2.5">
              <svg className="w-4 h-4 text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" d="M21 12V7H5a2 2 0 010-4h14v4m0 5v5a1 1 0 01-1 1H5a2 2 0 01-2-2V6"/><circle cx="18" cy="12" r="1"/></svg>
              <h3 className="text-[13px] font-semibold text-white flex items-center">Wallets<InfoTip text="Token balances held by this node's keys. 'Voucher Master' funds the faucet; 'Funding' is a top-up key." /></h3>
            </div>
            {walletData?.total_balance != null && (
              <span className="text-[11px] text-zinc-500">
                Total: <span className="text-white font-semibold tabular-nums">{walletData.total_balance.toLocaleString()}</span>
              </span>
            )}
          </div>
          <div className="glow-separator" />
          <table className="w-full text-xs data-table">
            <thead>
              <tr className="text-[9px] text-zinc-600 uppercase tracking-widest">
                <th className="text-left py-2 px-5 font-medium">Key</th>
                <th className="text-left py-2 px-5 font-medium">Type</th>
                <th className="text-right py-2 px-5 font-medium">Balance</th>
                <th className="text-right py-2 px-5 font-medium">Notes</th>
                <th className="text-right py-2 px-5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {(walletData?.wallets ?? []).map((w: any) => (
                <tr key={w.key}>
                  <td className="py-2 px-5 hash text-zinc-400">{w.short}</td>
                  <td className="py-2 px-5 text-zinc-500">{w.is_voucher ? "Voucher Master" : "Funding"}</td>
                  <td className="py-2 px-5 text-right tabular-nums font-medium">{w.balance != null ? w.balance.toLocaleString() : "---"}</td>
                  <td className="py-2 px-5 text-right tabular-nums text-zinc-500">{w.notes}</td>
                  <td className="py-2 px-5 text-right"><WalletStatusBadge status={w.status} /></td>
                </tr>
              ))}
              {!walletData?.wallets?.length && (
                <tr><td colSpan={5} className="p-0"><SkeletonRows rows={4} /></td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Consensus State */}
        <div className="glass rounded-xl px-5 py-3 animate-in md:col-span-6 lg:col-span-6">
          <h3 className="text-[10px] text-zinc-500 uppercase tracking-widest font-medium py-2 mb-1 flex items-center">Consensus State<InfoTip text="The raw chain-position numbers your node currently reports." /></h3>
          <InfoRow label="Mode" value={c?.mode ?? "—"} tip="Online means the node is fully participating in consensus." />
          <InfoRow label="Height" value={c?.height?.toLocaleString() ?? "—"} tip="The latest block number." />
          <InfoRow label="Slot" value={`${c?.slot?.toLocaleString() ?? "—"} / ${sy?.live_slot?.toLocaleString() ?? "—"} live`} tip="Your node's current slot vs. the network's live slot (~1s each)." />
          <InfoRow label="LIB Slot" value={c?.lib_slot?.toLocaleString() ?? "—"} tip="Last Irreversible Block slot — newest block that can't be reverted." />
          <InfoRow label="Finality" value={`${c?.finality_lag ?? "—"} slots`} tip="Slots between the latest block and the last irreversible one." />
          <InfoRow label="Sync" value={`${sy?.percent?.toFixed(2) ?? "—"}% (${sy?.slot_rate ?? "—"} slots/s)`} tip="How caught up the node is, and how fast it's catching up." />
          <InfoRow label="Tip Hash" value={c?.tip_hash ?? "—"} mono tip="Unique fingerprint (hash) of the latest block." />
          <InfoRow label="LIB Hash" value={c?.lib_hash ?? "—"} mono tip="Unique fingerprint of the last irreversible block." />
        </div>

        {/* Network Identity */}
        <div className="glass rounded-xl px-5 py-3 animate-in md:col-span-6 lg:col-span-6">
          <h3 className="text-[10px] text-zinc-500 uppercase tracking-widest font-medium py-2 mb-1 flex items-center">Network Identity<InfoTip text="Who your node is on the peer-to-peer network and where it can be reached." align="right" /></h3>
          <InfoRow label="Peer ID" value={n?.peer_id ?? "—"} mono tip="Your node's unique address/identity on the peer-to-peer network." tipAlign="right" />
          {self?.city && <InfoRow label="Location" value={`${self.city}${self.region ? ", " + self.region : ""}, ${self.country}`} tip="Approximate geographic location of this node, from its public IP." tipAlign="right" />}
          {self?.timezone && <InfoRow label="Timezone" value={self.timezone} tip="Timezone of this node's location." tipAlign="right" />}
          {self?.ip && <InfoRow label="Public IP" value={self.ip} mono tip="This node's public egress IP address." tipAlign="right" />}
          {self?.isp && <InfoRow label="ISP" value={self.isp} tip="Internet / hosting provider for this node's connection." tipAlign="right" />}
          {self?.asn && <InfoRow label="Network" value={self.asn} mono tip="The Autonomous System (ASN) that owns this node's IP range." tipAlign="right" />}
          <InfoRow label="Uptime" value={trackingMinutes > 0 ? `${fmtDur(trackingMinutes * 60)} monitored` : "—"} tip="How long this dashboard has been continuously tracking the node (monitoring window — not the node's true process uptime)." tipAlign="right" />
          {(walletData?.wallets ?? []).map((w: any, i: number) => (
            <InfoRow key={w.key} label={i === 0 ? "Wallet" : ""} value={w.key} mono tip={i === 0 ? "This node's wallet address (full public key) used for faucet / voucher operations." : undefined} tipAlign="right" />
          ))}
          <InfoRow label="Peers" value={`${n?.peers ?? "—"} (avg ${s?.avg_peers ?? "—"}/h)`} tip="Nodes connected now, and the hourly average." tipAlign="right" />
          <InfoRow label="Connections" value={`${n?.connections ?? "—"} (avg ${s?.avg_conn ?? "—"}/h)`} tip="Open network connections now, and the hourly average." tipAlign="right" />
          <InfoRow label="Pending" value={n?.pending?.toString() ?? "—"} tip="Connections still being established." tipAlign="right" />
          {n?.listen_addresses?.map((addr: string, i: number) => (
            <InfoRow key={i} label={i === 0 ? "Addresses" : ""} value={addr} mono tip={i === 0 ? "Network addresses where other nodes can reach yours." : undefined} tipAlign="right" />
          ))}
        </div>
      </div>
    </div>
  );
}
