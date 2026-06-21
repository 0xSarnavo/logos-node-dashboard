export interface ChainInfo {
  height: number;
  slot: number;
  lib_slot: number;
  lib_hash: string;
  tip_hash: string;
  mode: string;
  finality_lag: number;
}

export interface NetworkInfo {
  peer_id: string;
  n_peers: number;
  n_connections: number;
  n_pending_connections: number;
  listen_addresses: string[];
}

export interface Block {
  height: number;
  block_hash: string;
  ts: string;
  block_time_ms?: number;
}

export interface BlockEvent {
  height: number;
  tip_hash: string;
  ts: string;
  block_time_ms: number;
}

export interface ChainStats {
  avg_block_time: number;
  blocks_1h: number;
  blocks_24h: number;
  total_indexed: number;
  height: number;
  slot: number;
  lib_slot: number;
  mode: string;
  tip_hash: string;
  lib_hash: string;
  peers: number;
  connections: number;
  pending: number;
  peer_id: string;
}

export interface TimePoint {
  time: string;
  value: number;
}

export interface NetworkHistory {
  time: string;
  peers: number;
  connections: number;
  pending: number;
}
