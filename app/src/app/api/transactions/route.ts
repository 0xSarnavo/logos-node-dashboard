import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { fetchNode, fetchNodePost } from "@/lib/node";
import { decodeBlockTxs, DecodedTx } from "@/lib/tx";
import { resolveRange } from "@/lib/ranges";

export const dynamic = "force-dynamic";

// Decoded blocks are immutable — cache them so the poll doesn't re-hit the node.
const cache = new Map<string, DecodedTx[]>();

async function getTxs(hash: string): Promise<DecodedTx[]> {
  const c = cache.get(hash);
  if (c) return c;
  const block = await fetchNodePost<any>("storage/block", hash);
  const txs = block ? decodeBlockTxs(block) : [];
  cache.set(hash, txs);
  if (cache.size > 2000) cache.delete(cache.keys().next().value!);
  return txs;
}

const RECENT_SQL = `SELECT bc.height, bc.slot, bc.tx_count, bc.block_size, bc.block_hash FROM block_content bc ORDER BY bc.height DESC LIMIT 50`;

// A block is final (confirmed) once its slot is at/below the last-irreversible-block slot.
function markFinal(rows: any[], libSlot: number) {
  return rows.map((r: any) => ({ ...r, final: Number(r.slot) > 0 && Number(r.slot) <= libSlot }));
}

export async function GET(req: NextRequest) {
  const blockParam = (req.nextUrl.searchParams.get("block") || "").toLowerCase();
  const rangeParam = req.nextUrl.searchParams.get("range");
  const page = parseInt(req.nextUrl.searchParams.get("page") || "1");
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") || "25"), 100);
  const offset = (page - 1) * limit;

  try {
    const info = await fetchNode<any>("cryptarchia/info");
    const libSlot = info?.lib_slot ?? 0;

    // --- Single-block filter (clicked from the strip) ---
    if (/^[a-f0-9]{64}$/.test(blockParam)) {
      const [txs, metaRes, recentBlocks] = await Promise.all([
        getTxs(blockParam),
        pool.query(
          `SELECT bc.height, bc.slot, bc.leader_key, b.ts FROM block_content bc
           JOIN blocks b ON bc.block_hash = b.block_hash WHERE bc.block_hash = $1`,
          [blockParam]
        ),
        pool.query(RECENT_SQL),
      ]);
      const m = metaRes.rows[0] || {};
      const final = Number(m.slot) > 0 && Number(m.slot) <= libSlot;
      const transactions = txs.map((tx) => ({
        block_hash: blockParam, height: m.height, slot: m.slot, leader_key: m.leader_key,
        indexed_at: m.ts, final, index: tx.index, op_count: tx.opCount, opcodes: tx.opcodes,
      }));
      return NextResponse.json({
        transactions, total: transactions.length, page: 1, pages: 1,
        recent_blocks: markFinal(recentBlocks.rows, libSlot),
        filtered_block: { hash: blockParam, height: m.height ?? null },
      });
    }

    // --- Optional time-range filter ---
    const where = ["bc.tx_count > 0"];
    if (rangeParam && rangeParam !== "all") {
      const { win } = resolveRange(rangeParam);
      where.push(`b.ts > NOW() - INTERVAL '${win}'`);
    }
    const whereSql = where.join(" AND ");

    const [blkRes, countRes, recentBlocks] = await Promise.all([
      pool.query(
        `SELECT bc.height, bc.slot, bc.block_hash, bc.block_size, bc.leader_key, b.ts AS indexed_at
         FROM block_content bc JOIN blocks b ON bc.block_hash = b.block_hash
         WHERE ${whereSql} ORDER BY bc.height DESC LIMIT $1 OFFSET $2`,
        [limit, offset]
      ),
      pool.query(`SELECT COUNT(*) FROM block_content bc JOIN blocks b ON bc.block_hash = b.block_hash WHERE ${whereSql}`),
      pool.query(RECENT_SQL),
    ]);

    const decoded = await Promise.all(
      blkRes.rows.map(async (b: any) => {
        const txs = await getTxs(b.block_hash);
        const final = Number(b.slot) > 0 && Number(b.slot) <= libSlot;
        return txs.map((tx) => ({
          block_hash: b.block_hash, height: b.height, slot: b.slot, leader_key: b.leader_key,
          indexed_at: b.indexed_at, final, index: tx.index, op_count: tx.opCount, opcodes: tx.opcodes,
        }));
      })
    );

    return NextResponse.json({
      transactions: decoded.flat(),
      total: parseInt(countRes.rows[0].count),
      page,
      pages: Math.ceil(parseInt(countRes.rows[0].count) / limit),
      lib_slot: libSlot,
      recent_blocks: markFinal(recentBlocks.rows, libSlot),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
