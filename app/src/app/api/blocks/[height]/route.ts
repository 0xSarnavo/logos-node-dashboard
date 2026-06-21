import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { fetchNode } from "@/lib/node";

export const dynamic = "force-dynamic";

const GENESIS = 1776093586;
const SIDECAR_API = process.env.SIDECAR_API || "http://sidecar:8081";

async function getBlockContent(blockHash: string) {
  // Get block metadata from DB (fast)
  let dbData: any = null;
  try {
    const dbRes = await pool.query(
      "SELECT * FROM block_content WHERE block_hash = $1 LIMIT 1",
      [blockHash]
    );
    if (dbRes.rows.length) {
      const r = dbRes.rows[0];
      dbData = {
        hash: r.block_hash,
        slot: parseInt(r.slot),
        version: r.version,
        parent_hash: r.parent_hash,
        block_root: r.block_root,
        voucher_cm: r.voucher_cm,
        entropy: r.entropy,
        leader_key: r.leader_key,
        size: r.block_size,
        tx_count: r.tx_count,
        transactions: [],
        source: "db",
      };
    }
  } catch {}

  // Always try sidecar for transaction details (it parses the raw block)
  try {
    const res = await fetch(`${SIDECAR_API}/block/${blockHash}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const sidecar = await res.json();
      if (dbData) {
        // Merge: use DB for metadata (fast), sidecar for transactions
        dbData.transactions = sidecar.transactions || [];
        if (sidecar.tx_count > dbData.tx_count) dbData.tx_count = sidecar.tx_count;
        return dbData;
      }
      return { ...sidecar, source: "sidecar" };
    }
  } catch {}

  // Return DB data even without sidecar tx details
  return dbData;
}

export async function GET(_req: NextRequest, { params }: { params: { height: string } }) {
  const height = parseInt(params.height);

  try {
    const [blockRes, eventRes, prevRes, nextRes, nodeInfo, nearbyRes, snapshotRes] = await Promise.all([
      pool.query("SELECT * FROM blocks WHERE height = $1", [height]),
      pool.query("SELECT * FROM block_events WHERE height = $1 LIMIT 1", [height]),
      pool.query("SELECT height, block_hash FROM blocks WHERE height < $1 AND is_orphaned = FALSE ORDER BY height DESC LIMIT 5", [height]),
      pool.query("SELECT height, block_hash FROM blocks WHERE height > $1 AND is_orphaned = FALSE ORDER BY height ASC LIMIT 5", [height]),
      fetchNode<any>("cryptarchia/info"),
      // Get surrounding blocks for context
      pool.query(`
        SELECT b.height, LEFT(b.block_hash, 16) as hash_short, b.is_orphaned, be.block_time_ms
        FROM blocks b LEFT JOIN block_events be ON b.height = be.height
        WHERE b.height BETWEEN $1 AND $2
        ORDER BY b.height`, [height - 5, height + 5]),
      // Get consensus snapshot closest to this block
      pool.query(`
        SELECT block_height, slot, lib_slot, mode
        FROM consensus_snapshots
        WHERE block_height >= $1
        ORDER BY ts ASC LIMIT 1`, [height]),
    ]);

    if (!blockRes.rows.length) {
      return NextResponse.json({ error: "Block not found" }, { status: 404 });
    }

    const block = blockRes.rows[0];
    const tipHeight = nodeInfo?.height ?? 0;
    const tipSlot = nodeInfo?.slot ?? 0;
    const libSlot = nodeInfo?.lib_slot ?? 0;
    const slotGap = tipSlot - libSlot;
    const estimatedLibHeight = Math.max(0, tipHeight - Math.ceil(slotGap / 18));
    const slotsPerHeight = tipHeight > 0 ? tipSlot / tipHeight : 18;
    const estimatedSlot = Math.round(height * slotsPerHeight);
    const estimatedTime = new Date((GENESIS + estimatedSlot) * 1000).toISOString();

    // Determine status
    let status = "pending";
    if (block.is_orphaned) status = "orphaned";
    else if (height <= estimatedLibHeight) status = "confirmed";

    // Check for other blocks at this height (potential orphans)
    const allAtHeight = blockRes.rows;

    // Snapshot data for this block's time
    const snapshot = snapshotRes.rows[0] ?? null;

    return NextResponse.json({
      block: {
        height: block.height,
        block_hash: block.block_hash,
        is_orphaned: block.is_orphaned,
        indexed_at: block.ts,
        status,
      },
      event: eventRes.rows[0] ? {
        produced_at: eventRes.rows[0].ts,
        tip_hash: eventRes.rows[0].tip_hash,
        block_time_ms: parseInt(eventRes.rows[0].block_time_ms),
      } : null,
      chain_context: {
        estimated_slot: estimatedSlot,
        estimated_time: estimatedTime,
        tip_height: tipHeight,
        tip_slot: tipSlot,
        lib_height: estimatedLibHeight,
        lib_slot: libSlot,
        confirmations: height <= estimatedLibHeight ? estimatedLibHeight - height : 0,
        blocks_to_finality: height > estimatedLibHeight ? height - estimatedLibHeight : 0,
      },
      snapshot: snapshot ? {
        slot_at_time: snapshot.slot,
        lib_slot_at_time: snapshot.lib_slot,
        mode: snapshot.mode,
      } : null,
      // Fetch block content from sidecar (reads RocksDB directly)
      block_content: await getBlockContent(block.block_hash),
      neighbors: {
        prev: prevRes.rows.map((r: any) => ({ height: r.height, hash: r.block_hash })),
        next: nextRes.rows.map((r: any) => ({ height: r.height, hash: r.block_hash })),
      },
      nearby_blocks: nearbyRes.rows,
      duplicates_at_height: allAtHeight.length > 1 ? allAtHeight.length : 0,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
