import { NextRequest, NextResponse } from "next/server";
import { faucetEnabled, faucetDisabled } from "@/lib/api";

export const dynamic = "force-dynamic";

const FAUCET_URL = "https://testnet.blockchain.logos.co/web/faucet-backend";

// Public single-drip faucet — anyone can claim testnet tokens to a wallet key, no login.
// Simple per-IP cooldown to curb abuse (the upstream faucet also rate-limits per address).
const COOLDOWN_MS = 60_000;
const lastClaim = new Map<string, number>();

function clientIp(req: NextRequest): string {
  return (req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()) ||
    (req.headers.get("x-real-ip")) || "unknown";
}

export async function POST(req: NextRequest) {
  if (!faucetEnabled()) return faucetDisabled();

  const body = await req.json().catch(() => ({}));
  const key = typeof body.key === "string" ? body.key.trim() : "";
  // The key is interpolated into the outbound URL — only allow 64-hex (prevents request forgery).
  if (!/^[a-f0-9]{64}$/i.test(key)) {
    return NextResponse.json({ ok: false, error: "Enter a valid 64-character hex wallet key." }, { status: 400 });
  }

  const ip = clientIp(req);
  const now = Date.now();
  const last = lastClaim.get(ip) || 0;
  if (now - last < COOLDOWN_MS) {
    const wait = Math.ceil((COOLDOWN_MS - (now - last)) / 1000);
    return NextResponse.json({ ok: false, error: `Please wait ${wait}s before claiming again.` }, { status: 429 });
  }
  lastClaim.set(ip, now);

  try {
    const res = await fetch(`${FAUCET_URL}/${key}`, {
      method: "POST",
      headers: {
        "Origin": "https://testnet.blockchain.logos.co",
        "Referer": "https://testnet.blockchain.logos.co/web/faucet/",
      },
      signal: AbortSignal.timeout(15000),
    });
    const data: any = await res.json().catch(() => ({}));
    if (res.status === 200 && data.hash) {
      return NextResponse.json({ ok: true, hash: data.hash, amount: 1000 });
    }
    if (res.status === 429) {
      lastClaim.delete(ip); // upstream throttle, not ours — don't double-penalize
      return NextResponse.json({ ok: false, error: "Upstream faucet is rate-limiting this address. Try again later." }, { status: 429 });
    }
    return NextResponse.json({ ok: false, error: data.error || `Faucet returned ${res.status}.` }, { status: 502 });
  } catch {
    return NextResponse.json({ ok: false, error: "Faucet request failed. Try again." }, { status: 502 });
  }
}
