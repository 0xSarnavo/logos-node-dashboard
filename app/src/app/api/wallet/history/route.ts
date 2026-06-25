import { NextResponse } from "next/server";
import { fetchNode } from "@/lib/node";
import { WALLET_KEYS, shortKey } from "@/lib/wallets";
import { apiError } from "@/lib/api";
import { readAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await readAuth()).authed) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
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
          short: shortKey(key),
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
  } catch (e) {
    return apiError(e);
  }
}
