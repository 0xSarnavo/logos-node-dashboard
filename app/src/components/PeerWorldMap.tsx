"use client";
import { useEffect, useRef, useState } from "react";
import { ComposableMap, Geographies, Geography, Marker, Sphere } from "react-simple-maps";
import { timeAgo } from "@/lib/format";

const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";
// Square viewBox so the globe stays a full circle and never crops left/right or top/bottom,
// even when zoomed (zoom is clamped below the radius that would reach an edge).
const W = 720, H = 720, CX = W / 2, CY = H / 2, SCALE = 270;
const ZOOM_MIN = SCALE * 0.7, ZOOM_MAX = 348; // 2*348 = 696 < 720 → always inside the viewBox

export type PeerStatus = "bootstrap" | "online" | "inconsistent" | "offline";

export interface MapPeer {
  ip: string;
  lat: number;
  lon: number;
  city?: string;
  country?: string;
  isp?: string;
  is_bootstrap?: boolean;
  status?: PeerStatus;
  tracked?: string;
  last_seen?: string;
}

export interface SelfNode {
  lat: number;
  lon: number;
  city?: string;
  country?: string;
  ip?: string | null;
  isp?: string;
}

const STATUS_COLOR: Record<PeerStatus, string> = {
  online: "#22c55e",       // green
  inconsistent: "#facc15", // yellow
  offline: "#ef4444",      // red
  bootstrap: "#ffffff",    // white
};
const STATUS_LABEL: Record<PeerStatus, string> = {
  online: "Online", inconsistent: "Inconsistent", offline: "Offline", bootstrap: "Bootstrap",
};
const SELF_COLOR = "#3b82f6"; // blue — this node
function statusOf(p: MapPeer): PeerStatus {
  return p.status || (p.is_bootstrap ? "bootstrap" : "online");
}

function isVisible(lon: number, lat: number, rotLon: number, rotLat: number): boolean {
  const d2r = Math.PI / 180;
  const lonC = -rotLon, latC = -rotLat;
  const cosc =
    Math.sin(latC * d2r) * Math.sin(lat * d2r) +
    Math.cos(latC * d2r) * Math.cos(lat * d2r) * Math.cos((lon - lonC) * d2r);
  return cosc > 0.04;
}

export default function PeerWorldMap({ peers, self }: { peers: MapPeer[]; self?: SelfNode | null }) {
  const [rotLon, setRotLon] = useState(0);
  const [rotLat, setRotLat] = useState(-12);
  const [paused, setPaused] = useState(false);
  const [hover, setHover] = useState<MapPeer | null>(null);
  const [hoverSelf, setHoverSelf] = useState(false);
  const drag = useRef<{ x: number; y: number; lon: number; lat: number } | null>(null);
  const lonRef = useRef(0);
  const [scale, setScale] = useState(SCALE);
  const [light, setLight] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Track the active theme so the globe can be whiteish in light mode and dark in dark mode.
  useEffect(() => {
    const root = document.documentElement;
    const read = () => setLight(root.getAttribute("data-theme") === "light");
    read();
    const obs = new MutationObserver(read);
    obs.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  // Scroll to zoom (native non-passive listener so we can preventDefault page scroll).
  // Clamped so the sphere always stays fully inside the viewBox (no cropping).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setScale((s) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, s - e.deltaY * 0.6)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    if (paused) return;
    let raf = 0;
    let last: number | undefined;
    let acc = 0;
    const tick = (t: number) => {
      if (last === undefined) last = t;
      const dt = t - last;
      last = t;
      acc += dt;
      lonRef.current = (lonRef.current - dt * 0.0032) % 360;
      // Throttle React re-renders to ~30fps — the globe re-projects every country path per frame.
      if (acc >= 33) { setRotLon(lonRef.current); acc = 0; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [paused]);
  useEffect(() => { lonRef.current = rotLon; }, [rotLon]);

  const onDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY, lon: rotLon, lat: rotLat };
    setPaused(true);
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setRotLon(drag.current.lon + (e.clientX - drag.current.x) * 0.45);
    setRotLat(Math.max(-85, Math.min(85, drag.current.lat - (e.clientY - drag.current.y) * 0.45)));
  };
  const onUp = () => { drag.current = null; };

  // Theme-aware globe palette.
  const ocean = light ? ["#f3f6fa", "#e6ecf3", "#d4dde8"] : ["#16181d", "#0c0d11", "#050609"];
  const landFill = light ? "#ffffff" : "#111317";
  const landFillHover = light ? "#f8fafc" : "#181b21";
  const landStroke = light ? "#9aa7b8" : "#52525b";
  const sphereStroke = light ? "#c2ccd9" : "#3f3f46";
  const haloMid = light ? "rgba(100,116,139,0.16)" : "rgba(140,150,170,0.20)";
  const haloEdge = light ? "rgba(100,116,139,0)" : "rgba(140,150,170,0)";

  return (
    <div
      ref={containerRef}
      className="relative select-none mx-auto"
      style={{ maxWidth: 600, cursor: drag.current ? "grabbing" : "grab" }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => { setPaused(false); setHover(null); setHoverSelf(false); drag.current = null; }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
    >
      <ComposableMap
        projection="geoOrthographic"
        projectionConfig={{ rotate: [rotLon, rotLat, 0], scale }}
        width={W}
        height={H}
        style={{ width: "100%", height: "auto" }}
      >
        <defs>
          <radialGradient id="globe-dark" cx="38%" cy="32%" r="78%">
            <stop offset="0%" stopColor={ocean[0]} />
            <stop offset="60%" stopColor={ocean[1]} />
            <stop offset="100%" stopColor={ocean[2]} />
          </radialGradient>
          <radialGradient id="globe-halo" cx="50%" cy="50%" r="50%">
            <stop offset="80%" stopColor={haloEdge} />
            <stop offset="93%" stopColor={haloMid} />
            <stop offset="100%" stopColor={haloEdge} />
          </radialGradient>
          <filter id="halo-blur" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="4" /></filter>
        </defs>

        <circle cx={CX} cy={CY} r={scale + 11} fill="url(#globe-halo)" filter="url(#halo-blur)" />
        <Sphere id="sph" fill="url(#globe-dark)" stroke={sphereStroke} strokeWidth={0.6} />

        <Geographies geography={GEO_URL}>
          {({ geographies }: { geographies: any[] }) =>
            geographies.map((geo) => (
              <Geography
                key={geo.rsmKey}
                geography={geo}
                style={{
                  default: { fill: landFill, stroke: landStroke, strokeWidth: 0.5, strokeOpacity: 0.7, outline: "none" },
                  hover: { fill: landFillHover, stroke: landStroke, strokeWidth: 0.6, outline: "none" },
                  pressed: { fill: landFillHover, outline: "none" },
                }}
              />
            ))
          }
        </Geographies>

        {/* peer nodes */}
        {peers.map((p, i) => {
          if (p.lat == null || p.lon == null || !isVisible(p.lon, p.lat, rotLon, rotLat)) return null;
          const st = statusOf(p);
          const color = STATUS_COLOR[st];
          const isHover = hover?.ip === p.ip;
          return (
            <Marker key={`${p.ip}-${i}`} coordinates={[p.lon, p.lat]}>
              <g onMouseEnter={() => setHover(p)} onMouseLeave={() => setHover((h) => (h?.ip === p.ip ? null : h))} style={{ cursor: "pointer" }}>
                <circle r={isHover ? 9 : 6} fill={color} fillOpacity={0.22} />
                <circle
                  r={isHover ? 3.6 : 2.8}
                  fill={color}
                  stroke={light ? "#1e293b" : "#000"}
                  strokeWidth={0.8}
                  className={st === "online" ? "live-dot" : undefined}
                  style={{ filter: `drop-shadow(0 0 4px ${color})` }}
                />
              </g>
            </Marker>
          );
        })}

        {/* this node — blue, always labelled */}
        {self && isVisible(self.lon, self.lat, rotLon, rotLat) && (
          <Marker coordinates={[self.lon, self.lat]}>
            {/* No floating label (it clipped at the globe edge) — the blue dot + legend identify it,
                and hovering shows full details in the corner card. A second ring marks it at rest. */}
            <g onMouseEnter={() => setHoverSelf(true)} onMouseLeave={() => setHoverSelf(false)} style={{ cursor: "pointer" }}>
              <circle r={11} fill={SELF_COLOR} fillOpacity={0.18} />
              <circle r={7} fill="none" stroke={SELF_COLOR} strokeWidth={1} strokeOpacity={0.5} />
              <circle r={4} fill={SELF_COLOR} stroke={light ? "#1e293b" : "#000"} strokeWidth={1} className="live-dot" style={{ filter: `drop-shadow(0 0 6px ${SELF_COLOR})` }} />
            </g>
          </Marker>
        )}

      </ComposableMap>

      {/* Detail card — fixed in the corner so it never gets clipped when zoomed/near an edge.
          Covers hovered peers and My Node, with location, IP, ISP, status and last-seen. */}
      {(hover || hoverSelf) && (() => {
        const isSelf = hoverSelf && !hover;
        const p = hover;
        const st = isSelf || !p ? null : statusOf(p);
        const accent = isSelf ? SELF_COLOR : st ? STATUS_COLOR[st] : "#a3b3c6";
        const title = isSelf ? "My Node" : (p?.city || p?.country || "Unknown peer");
        const sub = isSelf
          ? [self?.city, self?.country].filter(Boolean).join(", ")
          : (p?.country && p?.city ? p.country : "");
        const ip = isSelf ? self?.ip : p?.ip;
        const isp = isSelf ? self?.isp : p?.isp;
        const statusLine = isSelf
          ? "This dashboard's node"
          : STATUS_LABEL[st!] + (p?.last_seen ? ` · seen ${timeAgo(p.last_seen, true)}` : p?.tracked ? ` · ${p.tracked}` : "");
        return (
          <div
            style={{
              position: "absolute", left: 12, bottom: 12, zIndex: 10, pointerEvents: "none",
              background: "rgba(10,14,22,0.96)", border: `1px solid ${accent}`, borderRadius: 8,
              padding: "8px 11px", minWidth: 170, maxWidth: 240, lineHeight: 1.5,
              boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
            }}
          >
            <div style={{ fontWeight: 700, color: "#ffffff", fontSize: 12.5 }}>{title}</div>
            {sub && <div style={{ color: "#a3b3c6", fontSize: 11 }}>{sub}</div>}
            {ip && <div style={{ color: "#8b97a8", fontSize: 11, fontFamily: "ui-monospace, monospace" }}>{ip}</div>}
            {isp && <div style={{ color: "#6b7686", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{isp}</div>}
            <div style={{ color: accent, fontSize: 11, fontWeight: 600, marginTop: 2 }}>{statusLine}</div>
          </div>
        );
      })()}
    </div>
  );
}
