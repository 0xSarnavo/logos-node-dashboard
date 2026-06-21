"use client";
import { useEffect, useRef, useState } from "react";
import { useLive } from "./useLive";

export default function Toast() {
  const { data: chain } = useLive<any>("/api/chain", 2000);
  const prevHeight = useRef<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!chain?.height) return;
    if (prevHeight.current !== null && chain.height > prevHeight.current) {
      setToast(`New block #${chain.height.toLocaleString()}`);
      setTimeout(() => setToast(null), 3000);
    }
    prevHeight.current = chain.height;
  }, [chain?.height]);

  if (!toast) return null;

  return (
    <div className="fixed top-16 right-4 z-50 animate-in">
      <div className="glass-strong rounded-lg px-4 py-2.5 text-xs flex items-center gap-2 shadow-xl">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/70" />
        {toast}
      </div>
    </div>
  );
}
