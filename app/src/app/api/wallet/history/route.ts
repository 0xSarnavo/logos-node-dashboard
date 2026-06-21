import { NextResponse } from "next/server";
import { fetchNode } from "@/lib/node";

export const dynamic = "force-dynamic";

const WALLET_KEYS = (
  process.env.WALLET_KEYS ||
  "5279d197c8a0a06fdb6a73a2e66cdd81cc206067ae5b852e784bbd6127441607,3b2e4ffbf402033542153420f04cbee61f27187437801bb08850bd22d540061c"
)
  .split(",")
  .filter(Boolean);

export async function GET() {
  try {
    const wallets = await Promise.all(
      WALLET_KEYS.map(async (key) => {
        const data = await fetchNode<any>(`wallet/${key}/balance`);
        const noteCount = data?.notes ? Object.keys(data.notes).length : 0;
        let status: "funded" | "empty" | "unreachable";
        if (!data) {
          status = "unreachable";
        } else if (data.balance > 0) {
          status = "funded";
        } else {
          status = "empty";
        }

        return {
          address: key,
          short: key.slice(0, 8) + "\u2026" + key.slice(-4),
          balance: data?.balance ?? 0,
          note_count: noteCount,
          status,
          is_voucher: key === WALLET_KEYS[0],
          label: key === WALLET_KEYS[0] ? "Voucher Wallet" : "Secondary Wallet",
        };
      })
    );

    const total_balance = wallets.reduce((sum, w) => sum + w.balance, 0);
    const total_notes = wallets.reduce((sum, w) => sum + w.note_count, 0);

    return NextResponse.json({
      wallets,
      total_balance,
      total_notes,
      keys_tracked: WALLET_KEYS.length,
      fetched_at: new Date().toISOString(),
      note: "Historical balance tracking requires indexer support. This endpoint currently returns live state.",
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
