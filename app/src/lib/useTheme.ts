"use client";
import { useEffect, useState } from "react";

// Tracks whether the active theme is light (data-theme="light" on <html>).
// Used by SVG/canvas surfaces (charts, globe) that can't rely on CSS overrides.
export function useIsLight() {
  const [light, setLight] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    const read = () => setLight(root.getAttribute("data-theme") === "light");
    read();
    const obs = new MutationObserver(read);
    obs.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);
  return light;
}

// Maps the explorer's dark-mode chart palette to darker, readable equivalents on white.
const LIGHT_SWAP: Record<string, string> = {
  "#ffffff": "#475569",
  "#fff": "#475569",
  "#e4e4e7": "#52525b",
  "#d4d4d8": "#64748b",
  "#a1a1aa": "#5b6472",
  "#71717a": "#52525b",
  "#22c55e": "#15803d", // green
  "#34d399": "#059669",
  "#facc15": "#b45309", // yellow → amber (readable on white)
  "#ef4444": "#dc2626", // red
  "#3b82f6": "#2563eb", // blue
};

// Returns a chart series color adjusted for the active theme.
export function chartColor(color: string, light: boolean): string {
  if (!light) return color;
  return LIGHT_SWAP[color.toLowerCase()] ?? color;
}
