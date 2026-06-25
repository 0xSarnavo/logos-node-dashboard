"use client";
import { useLive } from "@/components/useLive";

export default function StatusBar() {
  const { data } = useLive<any>("/api/chain", 2000);
  const online = data?.mode === "Online";

  return (
    <div className="fixed bottom-0 left-0 right-0 h-7 glass-strong flex items-center px-5 text-[10px] z-50">
      <div className="flex items-center gap-5 text-zinc-500">
        <span className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${online ? "bg-emerald-500/80 live-dot" : "bg-zinc-600"}`} />
          <span className={online ? "text-zinc-400" : "text-zinc-600"}>{online ? "Connected" : "Connecting..."}</span>
        </span>
        <span className="text-zinc-700">|</span>
        <span>slot <span className="text-zinc-400 tabular-nums">{data?.slot?.toLocaleString() ?? "—"}</span></span>
        <span>tip <span className="text-zinc-400 tabular-nums">{data?.height?.toLocaleString() ?? "—"}</span></span>
        <span>lib <span className="text-zinc-400 tabular-nums">{data?.lib_slot?.toLocaleString() ?? "—"}</span></span>
      </div>
      <span className="absolute left-1/2 -translate-x-1/2 text-zinc-600 whitespace-nowrap hidden md:block pointer-events-none">
        Independent personal project · not affiliated with or endorsed by Logos / logos.co
      </span>
      <div className="ml-auto flex items-center gap-5 text-zinc-500">
        <span>peers <span className="text-zinc-400 tabular-nums">{data?.peers ?? "—"}</span></span>
        <span>lag <span className="text-zinc-400 tabular-nums">{data?.finality_lag ?? "—"}</span></span>
        <span className="info-tip">
          <span className="text-zinc-700 cursor-help">?</span>
          <span className="tip-text" style={{ bottom: 'auto', top: 'auto', transform: 'translateX(-50%) translateY(-100%)', marginTop: '-8px' }}>
            Shortcuts: H=Home B=Blocks E=Events N=Node /=Search
          </span>
        </span>
      </div>
    </div>
  );
}
