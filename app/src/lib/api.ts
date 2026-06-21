import { NextResponse } from "next/server";

// Generic 500 that logs the real error server-side but never leaks message/stack to clients
// (fixes SEC-4 / ADD-10 — e.message leakage across routes).
export function apiError(e: unknown, status = 500) {
  console.error("[api]", e);
  return NextResponse.json({ error: "Internal error" }, { status });
}

// Parse a non-negative integer route/query param; returns null when invalid (fixes SEC-6 NaN-into-SQL).
export function parseIntParam(v: string | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

// Faucet kill-switch. Set FAUCET_ENABLED=false on any exposed/remote deployment to disable
// all faucet drip/session endpoints (mitigates SEC-3, ADD-4). Enabled by default for local use.
export function faucetEnabled(): boolean {
  return process.env.FAUCET_ENABLED !== "false";
}

export function faucetDisabled() {
  return NextResponse.json({ error: "Faucet is disabled (FAUCET_ENABLED=false)" }, { status: 403 });
}
