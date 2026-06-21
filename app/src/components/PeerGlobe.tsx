"use client";
import { useEffect, useRef } from "react";
import { useLive } from "./useLive";

export default function PeerGlobe({ height = 500 }: { height?: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<any>(null);
  const { data } = useLive<any>("/api/peers", 30000);

  useEffect(() => {
    if (!containerRef.current || globeRef.current) return;

    const script = document.createElement("script");
    script.src = "https://unpkg.com/three@0.160.0/build/three.min.js";
    script.onload = () => {
      initGlobe();
    };
    document.head.appendChild(script);

    function initGlobe() {
      const THREE = (window as any).THREE;
      if (!THREE || !containerRef.current) return;

      const container = containerRef.current;
      const w = container.clientWidth;
      const h = height;

      // Scene
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000);
      camera.position.z = 2.8;

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(w, h);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setClearColor(0x000000, 0);
      container.appendChild(renderer.domElement);

      // Globe sphere — dark but visible
      const globeGeo = new THREE.SphereGeometry(1, 64, 64);
      const globeMat = new THREE.MeshPhongMaterial({
        color: 0x0a0a0a,
        emissive: 0x111118,
        emissiveIntensity: 0.3,
        shininess: 15,
        transparent: false,
      });
      const globe = new THREE.Mesh(globeGeo, globeMat);
      scene.add(globe);

      // Latitude lines
      for (let lat = -60; lat <= 60; lat += 30) {
        const r = Math.cos((lat * Math.PI) / 180) * 1.003;
        const y = Math.sin((lat * Math.PI) / 180) * 1.003;
        const ringGeo = new THREE.RingGeometry(r - 0.001, r + 0.001, 80);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0x333333, transparent: true, opacity: 0.4, side: THREE.DoubleSide });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.y = y;
        ring.rotation.x = Math.PI / 2;
        globe.add(ring);
      }

      // Longitude lines
      for (let lon = 0; lon < 360; lon += 30) {
        const points = [];
        for (let i = 0; i <= 64; i++) {
          const angle = (i / 64) * Math.PI * 2;
          const x = Math.cos(angle) * 1.003;
          const y = Math.sin(angle) * 1.003;
          points.push(new THREE.Vector3(x, y, 0));
        }
        const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
        const lineMat = new THREE.LineBasicMaterial({ color: 0x333333, transparent: true, opacity: 0.3 });
        const line = new THREE.Line(lineGeo, lineMat);
        line.rotation.y = (lon * Math.PI) / 180;
        globe.add(line);
      }

      // Bright edge rim light
      const atmosGeo = new THREE.SphereGeometry(1.03, 64, 64);
      const atmosMat = new THREE.ShaderMaterial({
        vertexShader: `
          varying vec3 vNormal;
          void main() {
            vNormal = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          varying vec3 vNormal;
          void main() {
            float intensity = pow(0.65 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 3.0);
            gl_FragColor = vec4(0.3, 0.5, 0.4, 1.0) * intensity * 0.8;
          }
        `,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
        transparent: true,
      });
      scene.add(new THREE.Mesh(atmosGeo, atmosMat));

      // Lights
      const ambient = new THREE.AmbientLight(0x666666, 1.2);
      scene.add(ambient);
      const directional = new THREE.DirectionalLight(0xcccccc, 0.8);
      directional.position.set(5, 3, 5);
      scene.add(directional);
      const backLight = new THREE.DirectionalLight(0x335544, 0.4);
      backLight.position.set(-3, -1, -5);
      scene.add(backLight);

      // Store references
      globeRef.current = { THREE, scene, camera, renderer, globe, peers: null, peerGroup: null };

      // Animation
      let animId: number;
      function animate() {
        animId = requestAnimationFrame(animate);
        globe.rotation.y += 0.002;
        if (globeRef.current?.peerGroup) {
          globeRef.current.peerGroup.rotation.y += 0.002;
        }
        renderer.render(scene, camera);
      }
      animate();

      // Handle resize
      const onResize = () => {
        if (!containerRef.current) return;
        const nw = containerRef.current.clientWidth;
        camera.aspect = nw / h;
        camera.updateProjectionMatrix();
        renderer.setSize(nw, h);
      };
      window.addEventListener("resize", onResize);

      // Cleanup
      return () => {
        cancelAnimationFrame(animId);
        window.removeEventListener("resize", onResize);
        renderer.dispose();
      };
    }
  }, [height]);

  // Update peers when data changes
  useEffect(() => {
    if (!globeRef.current || !data?.peers?.length) return;

    const { THREE, scene } = globeRef.current;

    // Remove old peer group
    if (globeRef.current.peerGroup) {
      scene.remove(globeRef.current.peerGroup);
    }

    const peerGroup = new THREE.Group();

    data.peers.forEach((peer: any) => {
      if (peer.lat == null || peer.lon == null) return;

      const lat = (peer.lat * Math.PI) / 180;
      const lon = (-peer.lon * Math.PI) / 180;
      const r = 1.02;

      const x = r * Math.cos(lat) * Math.cos(lon);
      const y = r * Math.sin(lat);
      const z = r * Math.cos(lat) * Math.sin(lon);

      // Dot — bigger and glowing
      const size = peer.is_bootstrap ? 0.03 : 0.02;
      const color = peer.is_bootstrap ? 0xaaaaaa : 0x44ff88;
      const dotGeo = new THREE.SphereGeometry(size, 12, 12);
      const dotMat = new THREE.MeshBasicMaterial({ color });
      const dot = new THREE.Mesh(dotGeo, dotMat);
      dot.position.set(x, y, z);
      peerGroup.add(dot);

      // Glow halo around each peer
      const glowSize = peer.is_bootstrap ? 0.06 : 0.04;
      const glowColor = peer.is_bootstrap ? 0x888888 : 0x44ff88;
      const glowGeo = new THREE.SphereGeometry(glowSize, 12, 12);
      const glowMat = new THREE.MeshBasicMaterial({
        color: glowColor,
        transparent: true,
        opacity: 0.15,
      });
      const glow = new THREE.Mesh(glowGeo, glowMat);
      glow.position.set(x, y, z);
      peerGroup.add(glow);
    });

    scene.add(peerGroup);
    globeRef.current.peerGroup = peerGroup;
  }, [data]);

  const countries = data?.countries ?? [];
  const countryText = countries
    .map((c: any) => `${c.country} (${c.peer_count})`)
    .join("  ·  ");

  return (
    <div className="glass rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3">
        <div className="flex items-center gap-2.5">
          <svg className="w-4 h-4 text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"/>
          </svg>
          <h3 className="text-[13px] font-semibold text-white">Peer Network</h3>
        </div>
        <span className="text-[11px] text-zinc-500">{data?.total ?? 0} peers geolocated</span>
      </div>
      <div className="glow-separator" />
      <div ref={containerRef} style={{ height, background: "#000" }} />
      {countryText && (
        <div className="px-5 py-2.5 text-[10px] text-zinc-600 leading-relaxed border-t border-white/[0.03]">
          {countryText}
        </div>
      )}
      <div className="px-5 py-2 flex items-center gap-5 text-[10px] text-zinc-600 border-t border-white/[0.03]">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ background: "#44ff88" }} />
          Peer
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-zinc-500" />
          Bootstrap
        </span>
      </div>
    </div>
  );
}
