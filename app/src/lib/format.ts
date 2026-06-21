// Shared formatting helpers — consolidates timeAgo / truncHash / clock-time formatting that
// were copy-pasted (with drift) across pages and chart components (Q-6 / Q-7 / Q-12).

// Relative age. suffix=false → "just now"/"5s"/"3m"/"2h"/"1d" (page/table style).
// suffix=true  → "5s ago"/"3m ago"/… (peers style).
export function timeAgo(ts: string | number | null | undefined, suffix = false): string {
  if (!ts) return "—";
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (!Number.isFinite(s)) return "—";
  const a = suffix ? " ago" : "";
  if (!suffix && s < 5) return "just now";
  if (s < 60) return `${s}s${a}`;
  if (s < 3600) return `${Math.floor(s / 60)}m${a}`;
  if (s < 86400) return `${Math.floor(s / 3600)}h${a}`;
  return `${Math.floor(s / 86400)}d${a}`;
}

// Middle-elided hash/address, e.g. "5021e99d…369a36".
export function truncHash(h: string | null | undefined, head = 8, tail = 6): string {
  if (!h || h.length < head + tail + 2) return h || "—";
  return h.slice(0, head) + "…" + h.slice(-tail);
}

// HH:MM local time for chart axes/tooltips.
export function formatClockTime(ts: string): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
