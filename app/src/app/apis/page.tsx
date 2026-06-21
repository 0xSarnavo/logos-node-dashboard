"use client";
import { useState, useCallback } from "react";

// --- Types ---

interface ApiEndpoint {
  method: string;
  path: string;
  description: string;
  params?: string;
  category: "explorer" | "node" | "requested";
}

interface RequestedApi {
  endpoint: string;
  description: string;
  why: string;
  priority: "must" | "good" | "nice";
}

interface TryResult {
  path: string;
  status: "loading" | "ok" | "error";
  data?: any;
  error?: string;
  ms?: number;
}

// --- Data ---

const explorerApis: ApiEndpoint[] = [
  { method: "GET", path: "/api/stats", description: "Chain statistics overview: block counts, block times, peer stats, wallet balance, uptime, growth rate", category: "explorer" },
  { method: "GET", path: "/api/health", description: "Explorer and node health check with overall status (healthy/degraded/unhealthy)", category: "explorer" },
  { method: "GET", path: "/api/chain", description: "Combined chain state: height, slot, sync status, block production stats", category: "explorer" },
  { method: "GET", path: "/api/chain/slots", description: "Slot fill rate data for the last N slots. Param: count (default 200)", params: "?count=200", category: "explorer" },
  { method: "GET", path: "/api/chain/summary", description: "Human-readable chain summary with health score, wallet overview, latest block", category: "explorer" },
  { method: "GET", path: "/api/chain/history", description: "Time-series data for charting. Params: metric (height|block_time|finality|blocks_per_5m), range (1h|24h)", params: "?metric=block_time&range=1h", category: "explorer" },
  { method: "GET", path: "/api/blocks", description: "Paginated block list with filters. Params: page, limit, range, status, speed", params: "?limit=10", category: "explorer" },
  { method: "GET", path: "/api/blocks/latest", description: "Latest 10 blocks with enriched data: status, block time, confirmations, estimated slot", category: "explorer" },
  { method: "GET", path: "/api/network", description: "Network snapshot history for charts. Param: range (1h|24h)", params: "?range=1h", category: "explorer" },
  { method: "GET", path: "/api/peers", description: "All geolocated peers with country aggregation", category: "explorer" },
  { method: "GET", path: "/api/peers/stats", description: "Peer analytics: by country, by ISP, new peers, bootstrap ratio, continents", category: "explorer" },
  { method: "GET", path: "/api/wallet", description: "Wallet balances for tracked keys", category: "explorer" },
  { method: "GET", path: "/api/wallet/history", description: "Wallet balance state per key with note counts and status", category: "explorer" },
  { method: "GET", path: "/api/node", description: "Full node diagnostics: chain, sync, network, and DB stats", category: "explorer" },
  { method: "GET", path: "/api/search", description: "Search by block height or hash prefix. Param: q", params: "?q=1", category: "explorer" },
];

const nodeApis: { endpoint: string; description: string; works: boolean }[] = [
  { endpoint: "GET /cryptarchia/info", description: "Chain tip info: height, slot, LIB slot, tip hash, mode", works: true },
  { endpoint: "GET /cryptarchia/headers", description: "Block headers from the consensus layer", works: true },
  { endpoint: "GET /network/info", description: "Network peer info: peer_id, connections, listen addresses", works: true },
  { endpoint: "GET /wallet/{key}/balance", description: "Wallet balance and UTXO notes for a given public key", works: true },
  { endpoint: "GET /mempool/status", description: "Mempool size, pending transactions count", works: false },
  { endpoint: "GET /mempool/metrics", description: "Mempool throughput, gas metrics, fee distribution", works: false },
  { endpoint: "GET /cryptarchia/block/{hash}", description: "Full block data by hash including transactions", works: false },
  { endpoint: "GET /cryptarchia/slot/{slot}", description: "Block produced at a specific slot number", works: false },
  { endpoint: "GET /network/peers", description: "Detailed peer list with connection state and latency", works: false },
  { endpoint: "GET /network/topology", description: "Network topology and routing table", works: false },
  { endpoint: "GET /da/status", description: "Data Availability layer status and blob counts", works: false },
  { endpoint: "GET /cl/validators", description: "Consensus layer validator set and stake", works: false },
  { endpoint: "GET /cl/epoch/{epoch}", description: "Epoch summary: slots, blocks, participation rate", works: false },
  { endpoint: "GET /metrics", description: "Prometheus-format metrics endpoint", works: false },
];

const requestedApis: RequestedApi[] = [
  // Must Have
  { endpoint: "GET /mempool/status", description: "Current mempool state: size, tx count, memory usage", why: "Essential for showing pending transactions. Without it the explorer can only show confirmed blocks, not what is waiting to be included.", priority: "must" },
  { endpoint: "GET /cryptarchia/block/{hash}", description: "Full block data including all transactions, state root, and proposer", why: "The explorer currently only has headers. Full block data enables transaction-level views, gas analysis, and block detail pages.", priority: "must" },
  { endpoint: "GET /cryptarchia/slot/{slot}", description: "Get the block (or empty indicator) for a specific slot", why: "Needed for accurate slot fill rate calculation. Currently we estimate from heights which is imprecise.", priority: "must" },
  { endpoint: "GET /network/peers", description: "Detailed peer list with connection type, latency, protocol version, and sync state", why: "The indexer currently scrapes peer count only. Per-peer data enables latency maps, protocol version distribution, and peer quality scoring.", priority: "must" },
  // Good to Have
  { endpoint: "GET /cl/epoch/{epoch}", description: "Epoch summary with participation rate, slot fill rate, and committee info", why: "Enables epoch-level analytics and participation tracking. Useful for long-term chain health monitoring.", priority: "good" },
  { endpoint: "GET /cl/validators", description: "Active validator set with stake amounts and performance metrics", why: "Would enable validator leaderboards, stake distribution charts, and decentralization metrics.", priority: "good" },
  { endpoint: "GET /da/status", description: "Data Availability layer status, blob count, bandwidth usage", why: "The DA layer is a key differentiator. Exposing its metrics helps demonstrate throughput and reliability.", priority: "good" },
  { endpoint: "GET /metrics", description: "Standard Prometheus metrics endpoint for all node subsystems", why: "Would allow Grafana integration and standardized monitoring. Currently we reconstruct metrics from individual endpoints.", priority: "good" },
  // Nice to Have
  { endpoint: "GET /mempool/metrics", description: "Mempool throughput, fee distribution, eviction stats", why: "Enables fee market analysis and gas optimization recommendations for users.", priority: "nice" },
  { endpoint: "GET /network/topology", description: "Network graph structure, routing paths, cluster info", why: "Would enable visual network topology maps showing how information propagates through the network.", priority: "nice" },
  { endpoint: "GET /node/version", description: "Node software version, build info, supported protocols", why: "Helpful for tracking upgrade rollouts and protocol version distribution across the network.", priority: "nice" },
  { endpoint: "WS /subscribe/blocks", description: "WebSocket stream of new blocks as they are produced", why: "Would enable true real-time block feed without polling. Reduces latency and server load.", priority: "nice" },
];

// --- Component ---

export default function ApisPage() {
  const [results, setResults] = useState<Record<string, TryResult>>({});
  const [expandedPath, setExpandedPath] = useState<string | null>(null);

  const tryEndpoint = useCallback(async (path: string) => {
    setResults((prev) => ({
      ...prev,
      [path]: { path, status: "loading" },
    }));

    const start = performance.now();
    try {
      const res = await fetch(path);
      const ms = Math.round(performance.now() - start);
      const data = await res.json();
      setResults((prev) => ({
        ...prev,
        [path]: { path, status: res.ok ? "ok" : "error", data, ms, error: res.ok ? undefined : `HTTP ${res.status}` },
      }));
      setExpandedPath(path);
    } catch (e: any) {
      const ms = Math.round(performance.now() - start);
      setResults((prev) => ({
        ...prev,
        [path]: { path, status: "error", error: e.message, ms },
      }));
      setExpandedPath(path);
    }
  }, []);

  const priorityLabel: Record<string, { text: string; color: string }> = {
    must: { text: "Must Have", color: "text-red-400/80 border-red-400/20 bg-red-400/5" },
    good: { text: "Good to Have", color: "text-amber-400/80 border-amber-400/20 bg-amber-400/5" },
    nice: { text: "Nice to Have", color: "text-zinc-400/80 border-zinc-400/20 bg-zinc-400/5" },
  };

  return (
    <div className="px-6 py-5 mx-auto pb-16 max-w-6xl">
      {/* Header */}
      <div className="mb-8 animate-in">
        <h1 className="text-xl font-bold text-white mb-1.5">API Reference</h1>
        <p className="text-sm text-zinc-500">
          Explorer APIs, node endpoints, and requested capabilities for the Logos network.
        </p>
      </div>

      {/* Explorer APIs */}
      <section className="mb-10 animate-in" style={{ animationDelay: "0.05s" }}>
        <div className="flex items-center gap-3 mb-4">
          <svg className="w-4 h-4 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
          </svg>
          <h2 className="text-[15px] font-semibold text-white">Explorer APIs</h2>
          <span className="text-[10px] px-2 py-0.5 border border-white/10 rounded-full text-zinc-500 tabular-nums">
            {explorerApis.length} endpoints
          </span>
        </div>
        <div className="space-y-2">
          {explorerApis.map((api) => {
            const r = results[api.path];
            const isExpanded = expandedPath === api.path && r?.data;
            return (
              <div key={api.path} className="glass rounded-lg overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400/80 border border-emerald-500/15 shrink-0">
                    {api.method}
                  </span>
                  <code className="hash text-[13px] text-zinc-300 shrink-0">{api.path}</code>
                  <span className="text-[11px] text-zinc-600 truncate hidden md:block">{api.description}</span>
                  <div className="ml-auto flex items-center gap-2 shrink-0">
                    {r?.status === "ok" && (
                      <span className="text-[10px] text-zinc-600 tabular-nums">{r.ms}ms</span>
                    )}
                    <StatusDot status={r?.status} />
                    <button
                      onClick={() => tryEndpoint(api.path + (api.params || ""))}
                      disabled={r?.status === "loading"}
                      className="text-[11px] px-3 py-1 rounded-md border border-white/8 text-zinc-400 hover:text-white hover:border-white/15 hover:bg-white/5 transition-all duration-200 disabled:opacity-30"
                    >
                      {r?.status === "loading" ? "..." : "Try it"}
                    </button>
                  </div>
                </div>
                {/* Description on mobile */}
                <div className="px-4 pb-2 md:hidden">
                  <span className="text-[11px] text-zinc-600">{api.description}</span>
                </div>
                {/* Response */}
                {isExpanded && (
                  <div className="border-t border-white/[0.04]">
                    <div className="flex items-center justify-between px-4 py-2">
                      <span className="text-[10px] text-zinc-600 uppercase tracking-widest font-medium">Response</span>
                      <button
                        onClick={() => setExpandedPath(null)}
                        className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors"
                      >
                        Close
                      </button>
                    </div>
                    <pre className="px-4 pb-3 text-[11px] text-zinc-400 overflow-x-auto max-h-64 overflow-y-auto hash leading-relaxed">
                      {JSON.stringify(r.data, null, 2)}
                    </pre>
                  </div>
                )}
                {expandedPath === api.path && r?.status === "error" && (
                  <div className="border-t border-white/[0.04] px-4 py-3">
                    <span className="text-[11px] text-red-400/70">{r.error}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Node APIs */}
      <section className="mb-10 animate-in" style={{ animationDelay: "0.1s" }}>
        <div className="flex items-center gap-3 mb-4">
          <svg className="w-4 h-4 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008zm-3 6h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008z" />
          </svg>
          <h2 className="text-[15px] font-semibold text-white">Node APIs</h2>
          <span className="text-[10px] px-2 py-0.5 border border-white/10 rounded-full text-zinc-500">
            Logos Node at <code className="hash">host.docker.internal:8080</code>
          </span>
        </div>
        <div className="glass rounded-lg overflow-hidden">
          <table className="w-full text-xs data-table">
            <thead>
              <tr className="text-[9px] text-zinc-600 uppercase tracking-widest">
                <th className="text-left py-2.5 px-4 font-medium w-8">Status</th>
                <th className="text-left py-2.5 px-4 font-medium">Endpoint</th>
                <th className="text-left py-2.5 px-4 font-medium hidden md:table-cell">Description</th>
              </tr>
            </thead>
            <tbody>
              {nodeApis.map((api) => (
                <tr key={api.endpoint}>
                  <td className="py-2.5 px-4">
                    <span
                      className={`w-2 h-2 rounded-full inline-block ${
                        api.works
                          ? "bg-emerald-500/70"
                          : "bg-zinc-700"
                      }`}
                    />
                  </td>
                  <td className="py-2.5 px-4">
                    <code className={`hash text-[12px] ${api.works ? "text-zinc-300" : "text-zinc-600 line-through"}`}>
                      {api.endpoint}
                    </code>
                  </td>
                  <td className="py-2.5 px-4 text-zinc-500 hidden md:table-cell">{api.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t border-white/[0.04] px-4 py-2.5 flex items-center gap-4">
            <span className="flex items-center gap-1.5 text-[10px] text-zinc-500">
              <span className="w-2 h-2 rounded-full bg-emerald-500/70 inline-block" />
              {nodeApis.filter((a) => a.works).length} working
            </span>
            <span className="flex items-center gap-1.5 text-[10px] text-zinc-500">
              <span className="w-2 h-2 rounded-full bg-zinc-700 inline-block" />
              {nodeApis.filter((a) => !a.works).length} missing
            </span>
          </div>
        </div>
      </section>

      {/* Requested APIs */}
      <section className="animate-in" style={{ animationDelay: "0.15s" }}>
        <div className="flex items-center gap-3 mb-4">
          <svg className="w-4 h-4 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
          </svg>
          <h2 className="text-[15px] font-semibold text-white">Requested APIs</h2>
          <span className="text-[10px] text-zinc-600">What we need from the node team</span>
        </div>

        {(["must", "good", "nice"] as const).map((priority) => {
          const apis = requestedApis.filter((a) => a.priority === priority);
          const pl = priorityLabel[priority];
          return (
            <div key={priority} className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${pl.color}`}>
                  {pl.text}
                </span>
                <span className="text-[10px] text-zinc-700 tabular-nums">{apis.length} endpoints</span>
              </div>
              <div className="space-y-2">
                {apis.map((api) => (
                  <div key={api.endpoint} className="glass rounded-lg px-4 py-3">
                    <div className="flex items-start gap-3">
                      <code className="hash text-[12px] text-zinc-400 shrink-0 mt-0.5">{api.endpoint}</code>
                      <div className="min-w-0">
                        <p className="text-[12px] text-zinc-300 mb-1">{api.description}</p>
                        <p className="text-[11px] text-zinc-600 leading-relaxed">{api.why}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}

function StatusDot({ status }: { status?: string }) {
  if (!status) return null;
  if (status === "loading")
    return (
      <span className="w-2 h-2 rounded-full bg-amber-400/70 live-dot" />
    );
  if (status === "ok")
    return <span className="w-2 h-2 rounded-full bg-emerald-500/70" />;
  return <span className="w-2 h-2 rounded-full bg-red-400/70" />;
}
