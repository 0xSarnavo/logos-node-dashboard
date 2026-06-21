"use client";
import { useLive } from "@/components/useLive";

export default function OfflineBanner() {
  const { data, error } = useLive<any>("/api/chain", 3000);
  const offline = error || data?.error || data?.mode === "Unknown";

  if (!offline) return null;

  return (
    <div className="fixed top-14 left-0 right-0 z-40 bg-red-500/10 border-b border-red-500/20 px-4 py-2 text-center text-xs text-red-400">
      Node API is not responding. Check if logos-blockchain-node is running.
    </div>
  );
}
