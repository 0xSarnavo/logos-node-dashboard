import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import pool from "@/lib/db";
import { fetchNodePost } from "@/lib/node";
import { decodeBlockTxs } from "@/lib/tx";

export const dynamic = "force-dynamic";

// `hash` is a block hash — returns the block's fully-decoded transactions + operations.
export async function GET(_req: NextRequest, { params }: { params: { hash: string } }) {
  const hash = (params.hash || "").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(hash)) {
    return NextResponse.json({ error: "Invalid block hash" }, { status: 400 });
  }

  try {
    const [block, metaRes] = await Promise.all([
      fetchNodePost<any>("storage/block", hash),
      pool.query(
        "SELECT height, slot, block_size, leader_key, parent_hash FROM block_content WHERE block_hash = $1",
        [hash]
      ),
    ]);

    if (!block) {
      return NextResponse.json({ error: "Block not found on node" }, { status: 404 });
    }

    return NextResponse.json({
      block_hash: hash,
      header: {
        version: block.header?.version,
        slot: block.header?.slot,
        parent_block: block.header?.parent_block,
        block_root: block.header?.block_root,
      },
      meta: metaRes.rows[0] ?? null,
      transactions: decodeBlockTxs(block),
    });
  } catch (e) {
    return apiError(e);
  }
}
