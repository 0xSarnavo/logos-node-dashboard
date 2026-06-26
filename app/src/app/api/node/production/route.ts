import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { readAuth } from "@/lib/auth";
import pool from "@/lib/db";
import { fetchNode } from "@/lib/node";

export const dynamic = "force-dynamic";

// Public key(s) that identify THIS node's proposed blocks. Set NODE_LEADER_KEYS
// (comma-separated 64-hex) to your node's leader/funding pk(s); falls back to
// WALLET_KEYS. Matched against block_content.leader_key.
function myLeaderKeys(): string[] {
  const raw = process.env.NODE_LEADER_KEYS || process.env.WALLET_KEYS || "";
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => /^[0-9a-f]{64}$/.test(s));
}

export async function GET() {
  if (!(await readAuth()).authed) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const keys = myLeaderKeys();
    const info = await fetchNode<any>("cryptarchia/info");
    const libSlot = Number(info?.lib_slot ?? 0);

    // Network-wide orphan numbers (counts only — we don't keep the orphan list).
    const net = await pool.query(
      `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE is_orphaned)::int AS orphaned FROM blocks`,
    );

    // This node's production. A block is final once its slot is at/under the LIB
    // slot and it isn't orphaned; orphaned blocks lost a short fork.
    let mine = { proposed: 0, final: 0, orphaned: 0, pending: 0 };
    if (keys.length) {
      const r = await pool.query(
        `SELECT
           COUNT(*)::int AS proposed,
           COUNT(*) FILTER (WHERE NOT b.is_orphaned AND bc.slot <= $2)::int AS final,
           COUNT(*) FILTER (WHERE b.is_orphaned)::int AS orphaned,
           COUNT(*) FILTER (WHERE NOT b.is_orphaned AND bc.slot > $2)::int AS pending
         FROM block_content bc
         JOIN blocks b ON b.block_hash = bc.block_hash
         WHERE lower(bc.leader_key) = ANY($1)`,
        [keys, libSlot],
      );
      mine = r.rows[0];
    }

    const total = net.rows[0].total as number;
    const orphaned = net.rows[0].orphaned as number;
    return NextResponse.json({
      configured: keys.length > 0,
      mine,
      myOrphanRate: mine.proposed > 0 ? (mine.orphaned / mine.proposed) * 100 : null,
      network: {
        total,
        orphaned,
        orphanRate: total > 0 ? (orphaned / total) * 100 : null,
      },
      libSlot,
      ts: Date.now(),
    });
  } catch (e) {
    return apiError(e);
  }
}
