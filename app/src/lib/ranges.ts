// Shared time-range definitions for history charts.
// `win` = how far back to query; `bucket` = aggregation interval (keeps each chart ~30-120 points).
// Both are fixed, whitelisted strings — never raw user input — so they're safe to interpolate into SQL.
export interface RangeDef {
  id: string;
  label: string;
  win: string;
  bucket: string;
}

export const RANGES: RangeDef[] = [
  { id: "5m", label: "5m", win: "5 minutes", bucket: "10 seconds" },
  { id: "15m", label: "15m", win: "15 minutes", bucket: "30 seconds" },
  { id: "30m", label: "30m", win: "30 minutes", bucket: "1 minute" },
  { id: "1h", label: "1h", win: "1 hour", bucket: "1 minute" },
  { id: "6h", label: "6h", win: "6 hours", bucket: "5 minutes" },
  { id: "12h", label: "12h", win: "12 hours", bucket: "10 minutes" },
  { id: "1d", label: "1d", win: "1 day", bucket: "15 minutes" },
  { id: "3d", label: "3d", win: "3 days", bucket: "1 hour" },
  { id: "5d", label: "5d", win: "5 days", bucket: "2 hours" },
  { id: "7d", label: "7d", win: "7 days", bucket: "3 hours" },
  { id: "15d", label: "15d", win: "15 days", bucket: "6 hours" },
  { id: "30d", label: "30d", win: "30 days", bucket: "12 hours" },
  { id: "3mo", label: "3mo", win: "90 days", bucket: "1 day" },
  { id: "6mo", label: "6mo", win: "180 days", bucket: "2 days" },
  { id: "1y", label: "1y", win: "365 days", bucket: "3 days" },
];

export function resolveRange(id: string | null): { win: string; bucket: string } {
  const key = id === "24h" ? "1d" : id; // legacy alias
  const r = RANGES.find((x) => x.id === key) || RANGES.find((x) => x.id === "1h")!;
  return { win: r.win, bucket: r.bucket };
}
