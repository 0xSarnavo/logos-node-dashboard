"""
Logos Node Sidecar API
Reads the node's RocksDB directly to expose block content.
Runs alongside the node — never modifies it. Survives upgrades.
"""

import os
import re
import struct
import subprocess
import json
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

DB_PATH = os.environ.get("DB_PATH", "/node-data/state/db")
LDB_BIN = os.environ.get("LDB_BIN", "ldb")
LISTEN_PORT = int(os.environ.get("SIDECAR_PORT", "8081"))
EMPTY_HASH = "0" * 64
NO_TX_SIZE = 388  # Block size with 0 transactions

print(f"[sidecar] DB: {DB_PATH}")
_cache = {}
_cache_ts = {}


def read_raw(block_hash):
    h = block_hash.lower().strip()
    if h in _cache and time.time() - _cache_ts.get(h, 0) < 120:
        return _cache[h]
    try:
        r = subprocess.run(
            [LDB_BIN, f"--db={DB_PATH}", "--column_family=default",
             "--try_load_options", "--ignore_unknown_options",
             "get", "--hex", f"0x{h}"],
            capture_output=True, text=True, timeout=5
        )
        if r.returncode != 0 or not r.stdout.strip():
            return None
        out = r.stdout.strip()
        if out.startswith("0x"):
            out = out[2:]
        data = bytes.fromhex(out)
        _cache[h] = data
        _cache_ts[h] = time.time()
        return data
    except Exception as e:
        print(f"[sidecar] read error: {e}")
        return None


def parse_block(block_hash, data):
    if not data or len(data) < 76:
        return None

    size = len(data)

    # === HEADER (fixed layout, validated against NODERS explorer) ===
    # 0-3:     Version (u32 LE)
    # 4-35:    Parent Hash (32 bytes)
    # 36-39:   Slot (u32 LE)
    # 40-43:   (reserved/padding)
    # 44-75:   Block Root (32 bytes)
    version = struct.unpack('<I', data[0:4])[0]
    parent_hash = data[4:36].hex()
    slot = struct.unpack('<I', data[36:40])[0]
    block_root = data[44:76].hex()

    # === BODY (positions validated against known blocks) ===
    entropy = data[212:244].hex() if size > 244 else None
    leader_key = data[252:284].hex() if size > 284 else None
    voucher_cm = data[284:316].hex() if size > 316 else None

    # Transaction detection
    # No-tx block = 388 bytes, each tx adds ~280 bytes
    has_tx = size > NO_TX_SIZE
    estimated_tx_count = max(0, (size - NO_TX_SIZE) // 250) if has_tx else 0

    # Scan for note transfers — look for any plausible token amounts
    transactions = []
    if has_tx:
        tx_data = data[316:]
        i = 0
        found_offsets = set()
        while i < len(tx_data) - 40:
            val = struct.unpack('<Q', tx_data[i:i + 8])[0]
            # Match token amounts: multiples of 1000, up to 10M, nonzero
            if 0 < val <= 10000000 and val % 1000 == 0 and i not in found_offsets:
                recipient = tx_data[i + 8:i + 40].hex() if i + 40 <= len(tx_data) else ""
                if recipient and recipient != EMPTY_HASH and len(set(recipient)) > 4:
                    transactions.append({
                        "type": "note_transfer",
                        "amount": val,
                        "recipient": recipient,
                    })
                    found_offsets.add(i)
                    i += 40  # Skip past this tx
                    continue
            i += 1

    # Status based on NODERS convention
    # We can't determine finality here (no node API access), so leave it to the explorer
    return {
        "hash": block_hash,
        "size": size,
        "version": version,
        "parent_hash": parent_hash,
        "slot": slot,
        "block_root": block_root,
        "entropy": entropy,
        "leader_key": leader_key,
        "voucher_cm": voucher_cm,
        "has_transactions": has_tx,
        "tx_count": max(len(transactions), estimated_tx_count),
        "transactions": transactions,
    }


def get_stats():
    total_size = 0
    if os.path.isdir(DB_PATH):
        for f in os.listdir(DB_PATH):
            fp = os.path.join(DB_PATH, f)
            if os.path.isfile(fp):
                total_size += os.path.getsize(fp)
    return {
        "db_path": DB_PATH,
        "db_size_bytes": total_size,
        "db_size_mb": round(total_size / 1024 / 1024, 1),
        "cache_entries": len(_cache),
    }


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        # No CORS header: the sidecar is internal-only (not published) and called
        # server-to-server by the explorer, so a wildcard ACAO is unnecessary (INF-2).
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = urlparse(self.path).path.rstrip("/")

        if path == "/health":
            return self._json(200, {"status": "ok", "db_exists": os.path.isdir(DB_PATH)})

        if path == "/stats":
            return self._json(200, get_stats())

        if path.startswith("/block/") and not path.endswith("/raw"):
            h = path[7:]
            if not re.match(r'^[a-f0-9]{64}$', h):
                return self._json(400, {"error": "Invalid hash"})
            data = read_raw(h)
            if not data:
                return self._json(404, {"error": "Block not found"})
            return self._json(200, parse_block(h, data))

        if path.startswith("/block/") and path.endswith("/raw"):
            h = path[7:-4]
            if not re.match(r'^[a-f0-9]{64}$', h):
                return self._json(400, {"error": "Invalid hash"})
            data = read_raw(h)
            if not data:
                return self._json(404, {"error": "Block not found"})
            return self._json(200, {"hash": h, "size": len(data), "hex": data.hex()})

        self._json(404, {"error": "Not found", "endpoints": [
            "GET /block/{hash}", "GET /block/{hash}/raw", "GET /health", "GET /stats"
        ]})


if __name__ == "__main__":
    srv = ThreadingHTTPServer(("0.0.0.0", LISTEN_PORT), Handler)
    print(f"[sidecar] Listening on :{LISTEN_PORT}")
    srv.serve_forever()
