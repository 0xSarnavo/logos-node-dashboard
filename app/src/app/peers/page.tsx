"use client";
import { useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { useLive } from "@/components/useLive";
import { SkeletonRows } from "@/components/Skeleton";
import { InfoTip } from "@/components/InfoTip";
import type { MapPeer, PeerStatus } from "@/components/PeerWorldMap";
import { timeAgo } from "@/lib/format";
import { useAuth } from "@/components/AuthProvider";

const PeerWorldMap = dynamic(() => import("@/components/PeerWorldMap"), {
  ssr: false,
  loading: () => (
    <div className="h-[340px] flex items-center justify-center text-[12px] text-zinc-600">Loading map…</div>
  ),
});

interface Peer {
  ip: string;
  lat: number;
  lon: number;
  country: string;
  country_code: string;
  city: string;
  isp: string;
  is_bootstrap: boolean;
  first_seen: string;
  last_seen: string;
}
interface PeersData { peers: Peer[]; countries: { country: string; country_code: string; peer_count: number }[]; total: number; connected_peers?: number | null; connected?: number | null; server_now?: number; }
interface StatsData {
  by_country: { country: string; country_code: string; count: number }[];
  by_isp: { isp: string; count: number }[];
  continents: { continent: string; count: number }[];
  bootstrap: { bootstrap: number; regular: number; total: number; ratio: number };
  new_peers_24h: { ip: string; country: string; city: string; isp: string; first_seen: string }[];
  new_peers_count: number;
}

const ACTIVE_WINDOW_MS = 10 * 60 * 1000; // last_seen within 10 min => active

function fmtDur(s: number | null) {
  if (s == null || s <= 0) return "—";
  s = Math.round(s);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}
function countryFlag(code: string): string {
  if (!code || code.length !== 2) return "🏳️";
  const off = 127397;
  return String.fromCodePoint(code.toUpperCase().charCodeAt(0) + off, code.toUpperCase().charCodeAt(1) + off);
}

function Panel({ title, tip, right, span, body, id, children }: {
  title: string; tip?: string; right?: ReactNode; span: string; body?: string; id?: string; children: ReactNode;
}) {
  return (
    <div id={id} className={`glass rounded-xl overflow-hidden animate-in flex flex-col ${span}`}>
      <div className="flex items-center justify-between px-4 py-2.5 gap-2">
        <h3 className="text-[10px] text-zinc-500 uppercase tracking-widest font-medium flex items-center">{title}{tip && <InfoTip text={tip} />}</h3>
        {right}
      </div>
      <div className="glow-separator" />
      <div className={body ?? ""}>{children}</div>
    </div>
  );
}

function Kpi({ label, tip, value, valueClass = "text-white", sub, span, dot }: {
  label: string; tip?: string; value: ReactNode; valueClass?: string; sub?: ReactNode; span: string; dot?: ReactNode;
}) {
  return (
    <div className={`stat-card rounded-xl p-3.5 animate-in ${span}`}>
      <p className="text-[9px] text-zinc-600 uppercase tracking-widest font-medium mb-1.5 flex items-center gap-1.5">{dot}{label}{tip && <InfoTip text={tip} align="right" />}</p>
      <p className={`text-2xl font-bold tabular-nums leading-none ${valueClass}`}>{value}</p>
      {sub != null && <p className="text-[10px] text-zinc-600 mt-2 truncate">{sub}</p>}
    </div>
  );
}

function BarRow({ label, count, max }: { label: ReactNode; count: number; max: number }) {
  const pct = max > 0 ? Math.max(3, (count / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3 px-4 py-1.5">
      <div className="w-36 shrink-0 text-[11px] text-zinc-300 truncate flex items-center gap-1.5">{label}</div>
      <div className="flex-1 h-1.5 bar-track rounded-full overflow-hidden">
        <div className="h-full bar-fill rounded-full" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 text-right text-[11px] tabular-nums text-zinc-400">{count}</span>
    </div>
  );
}

type SortKey = "status" | "ip" | "country" | "isp" | "observed" | "first_seen" | "last_seen";

export default function PeersPage() {
  const { authed } = useAuth();
  const { data } = useLive<PeersData>("/api/peers", 30000);
  const { data: stats } = useLive<StatsData>("/api/peers/stats", 30000);
  const { data: self } = useLive<{ lat: number; lon: number; city?: string; region?: string; country?: string; country_code?: string; ip?: string; isp?: string; asn?: string; timezone?: string }>("/api/peers/self", 120000);

  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "stale" | "bootstrap">("all");
  const [sortKey, setSortKey] = useState<SortKey>("observed");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Use the server's clock for staleness so the safety-net doesn't depend on the viewer's clock.
  const now = data?.server_now ?? Date.now();
  // The node logs its whole known-peer set at once (all peers share one last_seen), so we measure
  // a peer's status by how far behind the LATEST dump it is — a peer missing from recent dumps has
  // dropped out of the node's view — rather than by wall-clock age, which would flip every peer in
  // lockstep. Wall-clock still forces "offline" once the whole set goes very stale.
  const lastTimes = (data?.peers ?? []).map((p) => (p.last_seen ? new Date(p.last_seen).getTime() : 0));
  const freshest = lastTimes.length ? Math.max(...lastTimes) : now;
  const peers = (data?.peers ?? []).map((p) => {
    const last = p.last_seen ? new Date(p.last_seen).getTime() : 0;
    const first = p.first_seen ? new Date(p.first_seen).getTime() : last;
    const lagMin = last > 0 ? (freshest - last) / 60000 : Infinity; // dumps behind the current set
    const ageMin = last > 0 ? (now - last) / 60000 : Infinity;       // wall-clock since last seen
    const status: PeerStatus = p.is_bootstrap ? "bootstrap"
      : ageMin > 360 ? "offline"     // not seen at all in 6h → gone
      : lagMin < 5 ? "online"        // present in the latest peer dump
      : lagMin < 90 ? "inconsistent" // missed recent dumps
      : "offline";
    return { ...p, observed: Math.max(0, Math.floor((last - first) / 1000)), active: status === "online", status, _last: last, _first: first };
  });

  const total = data?.total ?? 0;
  // "Active now" = the node's real live connection count; fall back to the in-set peer count.
  const inSetCount = peers.filter((p) => p.status === "online").length;
  const connectedNow = data?.connected_peers ?? null;
  const activeCount = connectedNow ?? inSetCount;
  const staleCount = Math.max(0, peers.length - inSetCount);
  const statusCounts = {
    online: peers.filter((p) => p.status === "online").length,
    inconsistent: peers.filter((p) => p.status === "inconsistent").length,
    offline: peers.filter((p) => p.status === "offline").length,
    bootstrap: peers.filter((p) => p.status === "bootstrap").length,
  };
  const longestPeer = peers.reduce((mx, p) => (p.observed > (mx?.observed ?? -1) ? p : mx), peers[0]);
  const pctOf = (n: number) => (peers.length ? (n / peers.length) * 100 : 0);
  const countries = stats?.by_country ?? data?.countries?.map((c) => ({ country: c.country, country_code: c.country_code, count: c.peer_count })) ?? [];
  const continents = stats?.continents ?? [];
  // Include every tracked peer (single-sightings observe ~0) so the median isn't skewed (LOG-8).
  const observedSorted = peers.map((p) => p.observed).sort((a, b) => a - b);
  const median = observedSorted.length ? observedSorted[Math.floor(observedSorted.length / 2)] : 0;
  const earliest = peers.reduce((min, p) => (p._first && p._first < min ? p._first : min), now);
  const boot = stats?.bootstrap;
  const ccByIp: Record<string, string> = {};
  peers.forEach((p) => { if (p.country_code) ccByIp[p.ip] = p.country_code; });

  const health = activeCount >= 5 ? "ok" : activeCount >= 1 ? "warn" : "bad";
  const healthDot = health === "ok" ? "bg-emerald-500/70" : health === "warn" ? "bg-amber-500/70" : "bg-rose-500/70";
  const healthText = health === "ok" ? "text-emerald-400/80" : health === "warn" ? "text-amber-400/80" : "text-rose-400/70";

  // Longest-tracked leaderboard
  const longest = [...peers].sort((a, b) => b.observed - a.observed).slice(0, 100);
  const maxObserved = longest[0]?.observed || 1;

  // Map peers
  const mapPeers: MapPeer[] = peers.map((p) => ({
    ip: authed ? p.ip : "", lat: p.lat, lon: p.lon, city: p.city, country: p.country, isp: p.isp,
    is_bootstrap: p.is_bootstrap, status: p.status, tracked: fmtDur(p.observed), last_seen: p.last_seen,
  }));

  // Table: filter + search + sort
  const filtered = peers.filter((p) => {
    if (filter === "active" && !p.active) return false;
    if (filter === "stale" && p.active) return false;
    if (filter === "bootstrap" && !p.is_bootstrap) return false;
    if (q) {
      const s = q.toLowerCase();
      return [p.ip, p.city, p.country, p.isp].some((v) => v?.toLowerCase().includes(s));
    }
    return true;
  });
  const sorted = [...filtered].sort((a, b) => {
    let av: any, bv: any;
    switch (sortKey) {
      case "status": av = a.active ? 1 : 0; bv = b.active ? 1 : 0; break;
      case "ip": av = a.ip; bv = b.ip; break;
      case "country": av = a.country || ""; bv = b.country || ""; break;
      case "isp": av = a.isp || ""; bv = b.isp || ""; break;
      case "first_seen": av = a._first; bv = b._first; break;
      case "last_seen": av = a._last; bv = b._last; break;
      default: av = a.observed; bv = b.observed;
    }
    if (av < bv) return sortDir === "asc" ? -1 : 1;
    if (av > bv) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir(k === "ip" || k === "country" || k === "isp" ? "asc" : "desc"); }
  };
  const Th = ({ label, k, align = "left", tip }: { label: string; k: SortKey; align?: "left" | "right"; tip?: string }) => (
    <th
      onClick={() => toggleSort(k)}
      className={`py-2 px-4 font-medium text-[9px] uppercase tracking-widest cursor-pointer select-none ${align === "right" ? "text-right" : "text-left"} ${sortKey === k ? "text-zinc-300" : "text-zinc-600"} hover:text-zinc-400`}
    >
      <span className="inline-flex items-center gap-1">{label}{tip && <InfoTip text={tip} />}{sortKey === k && (sortDir === "desc" ? " ↓" : " ↑")}</span>
    </th>
  );

  const FilterChip = ({ id, label }: { id: typeof filter; label: string }) => (
    <button
      onClick={() => setFilter(id)}
      className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors ${filter === id ? "bg-white/10 text-white" : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.03]"}`}
    >{label}</button>
  );

  const railDivider = "flex items-center justify-between px-4 py-3 border-b border-white/[0.04]";

  return (
    <div className="px-6 py-5 mx-auto pb-12">
      {/* Header strip */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <h1 className="text-2xl font-bold tracking-tight">Peer Network</h1>
        <span className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full live-dot ${healthDot}`} />
          <span className={`text-xs font-medium ${healthText}`}>{activeCount} active</span>
        </span>
        <span className="ml-auto text-[10px] text-zinc-600">{total} tracked{data?.connected_peers != null ? ` · ${data.connected_peers} connected now` : ""} · tracking for {fmtDur((now - earliest) / 1000)}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-6 lg:grid-cols-12 gap-4">
        {/* Row 1 — Map hero */}
        <Panel title="Peer World Map" right={<span className="text-[11px] text-zinc-500">{total} pins</span>}
          span="md:col-span-6 lg:col-span-8" body="p-2">
          {data ? <PeerWorldMap peers={mapPeers} self={self?.lat != null ? self : null} /> : <div className="h-[340px] flex items-center justify-center text-[12px] text-zinc-600">Loading map…</div>}
          <div className="flex items-center gap-3.5 px-3 pt-2 pb-1 text-[10px] text-zinc-500 flex-wrap">
            <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-blue-500" />My Node</span>
            <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-green-500" />Online</span>
            <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />Inconsistent</span>
            <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-red-500" />Offline</span>
            <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-white ring-1 ring-zinc-500" />Bootstrap</span>
            <span className="ml-auto text-zinc-600">drag to rotate · scroll to zoom · hover a node</span>
          </div>
        </Panel>

        {/* Row 1 — Vitals rail */}
        <div className="glass rounded-xl overflow-hidden animate-in md:col-span-6 lg:col-span-4 flex flex-col">
          <div className="px-4 py-2.5"><h3 className="text-[10px] text-zinc-500 uppercase tracking-widest font-medium">Network Vitals</h3></div>
          <div className="glow-separator" />
          <div className="flex-1 flex flex-col justify-between">
            <div className={railDivider}>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/70 live-dot" />
                <span className="text-[11px] text-zinc-400 flex items-center">Active now<InfoTip text="Live peer connections the node holds right now (from the node API). The map and status below show all tracked peers and whether each is still in the node's latest peer set." /></span>
              </div>
              <span className="text-sm font-bold tabular-nums text-emerald-400">{activeCount}<span className="text-zinc-600 font-normal"> / {peers.length}</span></span>
            </div>

            {/* Peer status breakdown */}
            <div className="px-4 py-3 border-b border-white/[0.04]">
              <span className="text-[11px] text-zinc-400 flex items-center mb-2">Peer status<InfoTip text="Each tracked peer relative to the node's latest peer dump. Online: in the current set. Inconsistent: missed recent dumps. Offline: dropped from the set, or unseen for 6h. Bootstrap: seed nodes." /></span>
              <div className="h-2 rounded-full overflow-hidden flex bg-white/[0.04] mb-2.5">
                <div className="h-full bg-green-500" style={{ width: `${pctOf(statusCounts.online)}%` }} />
                <div className="h-full bg-yellow-400" style={{ width: `${pctOf(statusCounts.inconsistent)}%` }} />
                <div className="h-full bg-red-500" style={{ width: `${pctOf(statusCounts.offline)}%` }} />
                <div className="h-full bg-zinc-200" style={{ width: `${pctOf(statusCounts.bootstrap)}%` }} />
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[10px]">
                {([["bg-green-500", "Online", statusCounts.online], ["bg-yellow-400", "Inconsistent", statusCounts.inconsistent], ["bg-red-500", "Offline", statusCounts.offline], ["bg-zinc-200", "Bootstrap", statusCounts.bootstrap]] as const).map(([c, l, n]) => (
                  <div key={l} className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-zinc-500"><span className={`w-1.5 h-1.5 rounded-full ${c}`} />{l}</span>
                    <span className="tabular-nums text-zinc-300">{n}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className={railDivider}>
              <span className="text-[11px] text-zinc-400 flex items-center">Median tracked<InfoTip text="Median time between a peer's first and last sighting. This is an observation window, not true node uptime." /></span>
              <span className="text-sm font-bold tabular-nums">{fmtDur(median)}</span>
            </div>
            <div className={railDivider}>
              <span className="text-[11px] text-zinc-400 flex items-center">Longest tracked<InfoTip text="The single peer observed for the longest span (first to last sighting)." /></span>
              <span className="text-sm font-bold tabular-nums">{longestPeer ? fmtDur(longestPeer.observed) : "—"}</span>
            </div>
            <div className={railDivider}>
              <span className="text-[11px] text-zinc-400 flex items-center">New in 24h<InfoTip text="Peers first discovered in the last 24 hours." /></span>
              <span className="text-sm font-bold tabular-nums">{stats?.new_peers_count ?? 0}</span>
            </div>
            <div className={railDivider}>
              <span className="text-[11px] text-zinc-400 flex items-center">Top network<InfoTip text="Hosting provider (ISP) with the most peers." /></span>
              <span className="text-[12px] font-semibold tabular-nums truncate max-w-[150px]" title={stats?.by_isp?.[0]?.isp}>{stats?.by_isp?.[0] ? `${stats.by_isp[0].isp} · ${stats.by_isp[0].count}` : "—"}</span>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-[11px] text-zinc-400">Coverage</span>
              <span className="text-sm font-bold tabular-nums">{countries.length}<span className="text-zinc-600 font-normal"> countries · {continents.length} continents</span></span>
            </div>
          </div>
        </div>

        {/* Row 2 — KPI strip */}
        <Kpi span="md:col-span-3 lg:col-span-3" label="Total Peers" tip="Geolocated peers discovered from node connection logs." value={total} sub="geolocated" />
        <Kpi span="md:col-span-3 lg:col-span-3" label="Active Now" tip="Live peer connections the node holds right now, straight from the node API." dot={<span className="w-1.5 h-1.5 rounded-full bg-emerald-500/70 live-dot" />}
          value={activeCount} valueClass={activeCount > 0 ? "text-emerald-400" : "text-zinc-400"} sub={`of ${total} tracked${connectedNow != null ? " · live from node" : ""}`} />
        <Kpi span="md:col-span-3 lg:col-span-3" label="Bootstrap" tip="Hard-coded seed nodes." value={boot?.bootstrap ?? 0} sub={`${boot?.regular ?? 0} regular · ${boot?.ratio ?? 0}%`} />
        <Kpi span="md:col-span-3 lg:col-span-3" label="New (24h)" tip="First seen in the last 24h." value={stats?.new_peers_count ?? 0}
          sub={stats?.new_peers_24h?.[0] ? timeAgo(stats.new_peers_24h[0].first_seen, true) : "—"} />

        {/* My Node — this dashboard's own node on the network */}
        {self?.ip && (
          <div className="glass rounded-xl overflow-hidden animate-in md:col-span-6 lg:col-span-12">
            <div className="flex items-center gap-2 px-4 py-2.5">
              <span className="w-2 h-2 rounded-full bg-blue-500 live-dot" />
              <h3 className="text-[10px] text-zinc-300 uppercase tracking-widest font-medium">My Node</h3>
              <span className="text-[10px] text-zinc-600">this dashboard&apos;s node on the network</span>
            </div>
            <div className="glow-separator" />
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-px bg-white/[0.03]">
              {([
                ["IP", self.ip, true],
                ["Location", `${self.city || "—"}${self.region ? ", " + self.region : ""}`, false],
                ["Country", `${countryFlag(self.country_code || "")} ${self.country || "—"}`, false],
                ["ISP", self.isp || "—", false],
                ["Network", self.asn || "—", true],
                ["Timezone", self.timezone || "—", false],
              ] as const).map(([label, value, mono]) => (
                <div key={label} className="bg-black/40 px-4 py-2.5 min-w-0">
                  <p className="text-[9px] text-zinc-600 uppercase tracking-widest mb-1">{label}</p>
                  <p className={`text-[12px] text-zinc-200 truncate ${mono ? "hash" : ""}`} title={String(value)}>{value}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Row 3 — Longest tracked leaderboard */}
        <Panel title="Longest-Tracked Peers" tip="Ranked by time between first and last sighting (observation window, not true uptime)."
          span="md:col-span-6 lg:col-span-3" body="max-h-[360px] overflow-y-auto">
          {longest.length === 0 ? (
            <div className="px-4 py-10 text-center text-[12px] text-zinc-600">No peer history yet.</div>
          ) : longest.map((p, i) => (
            <div key={p.ip} className="px-4 py-2 border-b border-white/[0.03] last:border-0">
              <div className="flex items-center gap-2.5">
                <span className="w-5 text-[10px] tabular-nums text-zinc-600 text-right">{i + 1}</span>
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${p.active ? "bg-emerald-500/70" : "bg-zinc-600"}`} />
                <span className="text-base shrink-0">{countryFlag(p.country_code)}</span>
                <span className="hash text-[11px] text-zinc-300 truncate flex-1">{authed ? p.ip : (p.city || p.country || "peer")}</span>
                <span className="text-[12px] font-semibold tabular-nums">{fmtDur(p.observed)}</span>
              </div>
              <div className="flex items-center gap-2 mt-1 pl-[42px]">
                <div className="flex-1 h-1 bar-track rounded-full overflow-hidden">
                  <div className="h-full bar-fill rounded-full" style={{ width: `${(p.observed / maxObserved) * 100}%` }} />
                </div>
                <span className="text-[9px] text-zinc-600 shrink-0">{p.city || p.country || "—"}</span>
              </div>
            </div>
          ))}
        </Panel>

        {/* Row 3 — Top countries */}
        <Panel title="Top Countries" tip="Peer count by country." span="md:col-span-6 lg:col-span-3" body="max-h-[360px] overflow-y-auto py-1.5">
          {countries.length === 0 ? <div className="px-4 py-8 text-center text-[12px] text-zinc-600">—</div> :
            countries.slice(0, 30).map((c) => (
              <BarRow key={(c.country_code || "") + c.country} count={c.count} max={countries[0]?.count || 1}
                label={<><span className="text-base">{countryFlag(c.country_code)}</span><span className="truncate">{c.country}</span></>} />
            ))}
        </Panel>

        {/* Row 3 — Top ISPs */}
        <Panel title="Top Networks / ISPs" tip="Peers per hosting provider. Heavy concentration in one network means less decentralization."
          span="md:col-span-6 lg:col-span-3" body="max-h-[360px] overflow-y-auto py-1.5">
          {!stats?.by_isp?.length ? <div className="px-4 py-8 text-center text-[12px] text-zinc-600">—</div> :
            stats.by_isp.slice(0, 12).map((s) => (
              <BarRow key={s.isp} count={s.count} max={stats.by_isp[0].count}
                label={<span className="truncate" title={s.isp}>{s.isp}</span>} />
            ))}
        </Panel>

        {/* Row 3 — Recently joined */}
        <Panel id="recently-joined" title="Recently Joined" tip="New peers discovered in the last 24 hours, newest first."
          right={<span className="text-[10px] px-1.5 py-0.5 rounded border border-white/[0.08] text-zinc-500 tabular-nums">{stats?.new_peers_count ?? 0}</span>}
          span="md:col-span-6 lg:col-span-3" body="max-h-[360px] overflow-y-auto">
          {!stats?.new_peers_24h?.length ? (
            <div className="px-4 py-10 text-center text-[12px] text-zinc-600">No new peers in the last 24h.</div>
          ) : stats.new_peers_24h.map((p, i) => (
            <div key={p.ip} className={`flex items-center gap-2.5 px-4 py-2 border-b border-white/[0.03] last:border-0 ${i === 0 ? "row-new" : ""}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 shrink-0" />
              <span className="text-base shrink-0">{countryFlag(ccByIp[p.ip] || "")}</span>
              <div className="min-w-0 flex-1">
                <p className="hash text-[11px] text-zinc-300 truncate">{authed ? p.ip : ([p.city, p.country].filter(Boolean).join(", ") || "peer")}</p>
                <p className="text-[9px] text-zinc-600 truncate">{[p.city, p.country].filter(Boolean).join(", ") || "—"}{p.isp ? ` · ${p.isp}` : ""}</p>
              </div>
              <span className="text-[10px] text-zinc-500 shrink-0">{timeAgo(p.first_seen, true)}</span>
            </div>
          ))}
        </Panel>

        {/* Row 5 — All peers table */}
        <div className="glass rounded-xl overflow-hidden animate-in md:col-span-6 lg:col-span-12">
          <div className="flex items-center justify-between px-4 py-2.5 gap-3 flex-wrap">
            <h3 className="text-[10px] text-zinc-500 uppercase tracking-widest font-medium">All Peers <span className="text-zinc-600">({sorted.length})</span></h3>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1 bg-white/[0.03] rounded-full p-0.5">
                <FilterChip id="all" label="All" />
                <FilterChip id="active" label="Active" />
                <FilterChip id="stale" label="Stale" />
                <FilterChip id="bootstrap" label="Bootstrap" />
              </div>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search ip / city / country / isp"
                className="bg-white/[0.03] border border-white/[0.06] rounded-md px-2.5 py-1 text-[11px] text-zinc-300 w-56 focus:outline-none focus:border-white/[0.12]" />
            </div>
          </div>
          <div className="glow-separator" />
          <div className="max-h-[560px] overflow-auto">
            <table className="w-full text-[12px] data-table">
              <thead className="sticky top-0 bg-black/90 backdrop-blur-sm z-10">
                <tr>
                  <Th label="St" k="status" />
                  <Th label="IP" k="ip" />
                  <Th label="Location" k="country" />
                  <Th label="ISP" k="isp" />
                  <Th label="Tracked For" k="observed" align="right" tip="Time between first and last sighting — observation window, not true uptime." />
                  <Th label="First Seen" k="first_seen" align="right" />
                  <Th label="Last Seen" k="last_seen" align="right" />
                </tr>
              </thead>
              <tbody>
                {self?.ip && filter === "all" && !q && (
                  <tr className="bg-blue-500/[0.05]">
                    <td className="py-2 px-4"><span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 live-dot" title="My Node" /></td>
                    <td className="py-2 px-4 hash tabular-nums text-zinc-200">{self.ip}<span className="ml-2 text-[9px] px-1.5 py-0.5 border border-blue-500/30 rounded text-blue-400/80 uppercase tracking-wider">my node</span></td>
                    <td className="py-2 px-4 text-zinc-400">{self.country_code && <span className="mr-1.5">{countryFlag(self.country_code)}</span>}{[self.city, self.country].filter(Boolean).join(", ") || "—"}</td>
                    <td className="py-2 px-4 text-zinc-500 max-w-[220px] truncate" title={self.isp}>{self.isp || "—"}</td>
                    <td className="py-2 px-4 text-right tabular-nums text-zinc-600">this node</td>
                    <td className="py-2 px-4 text-right text-zinc-600">—</td>
                    <td className="py-2 px-4 text-right tabular-nums text-blue-400/70">live</td>
                  </tr>
                )}
                {!data ? (
                  <tr><td colSpan={7} className="p-0"><SkeletonRows rows={6} /></td></tr>
                ) : sorted.length === 0 ? (
                  <tr><td colSpan={7} className="py-10 text-center text-[12px] text-zinc-600">No peers match.</td></tr>
                ) : sorted.map((p) => (
                  <tr key={p.ip}>
                    <td className="py-2 px-4"><span className={`inline-block w-1.5 h-1.5 rounded-full ${p.active ? "bg-emerald-500/70" : "bg-zinc-600"}`} title={p.active ? "Active" : "Stale"} /></td>
                    <td className="py-2 px-4 hash tabular-nums text-zinc-300">
                      {authed ? p.ip : "—"}
                      {p.is_bootstrap && <span className="ml-2 text-[9px] px-1.5 py-0.5 border border-white/[0.08] rounded text-zinc-500 uppercase tracking-wider">boot</span>}
                    </td>
                    <td className="py-2 px-4 text-zinc-400">
                      {p.country_code && <span className="mr-1.5">{countryFlag(p.country_code)}</span>}
                      {[p.city, p.country].filter(Boolean).join(", ") || "—"}
                    </td>
                    <td className="py-2 px-4 text-zinc-500 max-w-[220px] truncate" title={p.isp}>{p.isp || "—"}</td>
                    <td className="py-2 px-4 text-right tabular-nums font-medium">{fmtDur(p.observed)}</td>
                    <td className="py-2 px-4 text-right text-zinc-500">{timeAgo(p.first_seen, true)}</td>
                    <td className={`py-2 px-4 text-right tabular-nums ${p.active ? "text-emerald-400/70" : "text-zinc-500"}`}>{timeAgo(p.last_seen, true)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
