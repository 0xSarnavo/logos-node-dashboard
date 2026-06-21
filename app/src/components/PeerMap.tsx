"use client";
import { useEffect, useRef } from "react";
import { useLive } from "./useLive";

interface Peer {
  ip: string;
  lat: number;
  lon: number;
  country: string;
  country_code: string;
  city: string;
  isp: string;
  is_bootstrap: boolean;
  first_seen: string;
  last_seen: string;
}

interface CountrySummary {
  country: string;
  country_code: string;
  peer_count: number;
}

interface PeersData {
  peers: Peer[];
  countries: CountrySummary[];
  total: number;
}

export default function PeerMap({ height = 300 }: { height?: number }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const { data } = useLive<PeersData>("/api/peers", 30000);

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(link);

    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.onload = () => {
      const L = (window as any).L;
      const map = L.map(mapRef.current, {
        center: [25, 5],
        zoom: 2,
        zoomControl: false,
        attributionControl: false,
      });
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        maxZoom: 8,
        minZoom: 1,
      }).addTo(map);
      mapInstance.current = map;
    };
    document.head.appendChild(script);

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, []);

  // Update markers when data changes
  useEffect(() => {
    if (!mapInstance.current || !data?.peers) return;
    const L = (window as any).L;
    if (!L) return;

    // Clear old markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    data.peers.forEach((peer) => {
      if (peer.lat == null || peer.lon == null) return;

      let color: string;
      let radius: number;
      let fillOpacity: number;
      let label: string;

      if (peer.is_bootstrap) {
        color = "#6b7280";
        radius = 5;
        fillOpacity = 0.5;
        label = "Bootstrap";
      } else {
        color = "#22c55e";
        radius = 4;
        fillOpacity = 0.6;
        label = "Peer";
      }

      const marker = L.circleMarker([peer.lat, peer.lon], {
        radius,
        color,
        fillColor: color,
        fillOpacity,
        weight: 1,
      }).addTo(mapInstance.current);

      marker.bindPopup(
        `<div style="font-size:11px;line-height:1.5;color:#d4d4d8;">
          <b style="color:#fff;">${peer.ip}</b><br/>
          <span style="color:#a1a1aa;">${label}</span><br/>
          ${peer.city ? peer.city + ", " : ""}${peer.country || "Unknown"}<br/>
          <span style="color:#71717a;">${peer.isp || ""}</span>
        </div>`,
        { className: "peer-popup" }
      );

      markersRef.current.push(marker);
    });
  }, [data]);

  const countrySummary = data?.countries
    ?.map((c) => `${c.country} (${c.peer_count})`)
    .join(" \u00b7 ");

  return (
    <div className="glass rounded-xl overflow-hidden animate-in">
      <div className="flex items-center justify-between px-5 py-3">
        <div className="flex items-center gap-2.5">
          <svg className="w-4 h-4 text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"/></svg>
          <h3 className="text-[13px] font-semibold text-white">Peer Map</h3>
        </div>
        <span className="text-[11px] text-zinc-500">{data?.total ?? 0} peers geolocated</span>
      </div>
      <div className="glow-separator" />
      <div ref={mapRef} style={{ height }} />
      {countrySummary && (
        <div className="px-5 py-2.5 text-[11px] text-zinc-500 border-t border-white/[0.04] leading-relaxed">
          {countrySummary}
        </div>
      )}
    </div>
  );
}
