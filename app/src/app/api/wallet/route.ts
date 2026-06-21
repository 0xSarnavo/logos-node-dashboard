import { NextResponse } from "next/server";
import { fetchNode } from "@/lib/node";
import { WALLET_KEYS, shortKey } from "@/lib/wallets";
import { apiError } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const wallets = await Promise.all(
      WALLET_KEYS.map(async (key) => {
        const data = await fetchNode<any>(`wallet/${key}/balance`);
        return {
          key,
          short: shortKey(key),
          balance: data?.balance ?? null,
          notes: data?.notes ? Object.keys(data.notes).length : 0,
          status: data
            ? data.balance > 0
              ? "funded"
              : "empty"
            : "unreachable",
          is_voucher: key === WALLET_KEYS[0],
        };
      })
    );
    const total_balance = wallets.reduce(
      (sum, w) => sum + (w.balance ?? 0),
      0
    );
    return NextResponse.json({ wallets, total_balance });
  } catch (e) {
    return apiError(e);
  }
}
