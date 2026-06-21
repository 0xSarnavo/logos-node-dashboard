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
        return {
          key,
          short: key.slice(0, 8) + "\u2026" + key.slice(-4),
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
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
