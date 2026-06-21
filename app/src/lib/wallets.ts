// Central wallet-key config (fixes duplication across 5 routes; SEC-2 / Q-8).
//
// WALLET_KEYS are comma-separated 64-hex *public account identifiers* — used to receive
// faucet drips and read on-chain balances. They are NOT private signing keys or passwords.
// The demo values below are public testnet accounts; override with WALLET_KEYS in your env.
const DEMO_KEYS =
  "5279d197c8a0a06fdb6a73a2e66cdd81cc206067ae5b852e784bbd6127441607,3b2e4ffbf402033542153420f04cbee61f27187437801bb08850bd22d540061c";

export const WALLET_KEYS = (process.env.WALLET_KEYS || DEMO_KEYS)
  .split(",")
  .map((k) => k.trim())
  .filter(Boolean);

export const KEY_RE = /^[a-f0-9]{64}$/i;

// A key is only safe to interpolate into an outbound URL if it is exactly 64 hex chars.
export function isValidKey(k: unknown): k is string {
  return typeof k === "string" && KEY_RE.test(k);
}

// Redacted display form — never return a raw key to a client.
export function shortKey(k: string): string {
  return k.length > 12 ? k.slice(0, 8) + "…" + k.slice(-4) : k;
}
