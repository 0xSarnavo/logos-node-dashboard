"use client";
import { useLive } from "./useLive";
import { InfoTip } from "./InfoTip";

// Live slot-occupancy strip: each cell is a slot — a tall tick means a block was produced
// (emerald = live, darker = finalized), a thin line means the slot was empty.
export default function SlotStrip({ count = 200, bare = false }: { count?: number; bare?: boolean }) {
  const { data } = useLive<any>(`/api/chain/slots?count=${count}`, 3000);
  const slots = data?.slots ?? [];
  // newest produced block — gets a subtle pop-in as it arrives
  let lastBlockSlot: number | null = null;
  for (let i = slots.length - 1; i >= 0; i--) { if (slots[i].has_block) { lastBlockSlot = slots[i].slot; break; } }

  const content = (
    <>
      <div className="flex items-center justify-between mb-2.5">
        <h3 className="text-[10px] text-zinc-500 uppercase tracking-widest font-medium flex items-center">Live Slots<InfoTip text="Recent consensus slots. A tall green tick means a block was produced in that slot (darker green = finalized); a thin line means the slot was empty. The newest block pops in on the right." /></h3>
        <span className="text-[10px] text-zinc-600 tabular-nums">
          {data ? `${data.fill_rate}% filled · ${data.filled}/${data.total} slots` : "—"}
        </span>
      </div>

      <div className="flex items-center h-7">
        {slots.length === 0 ? (
          <div className="w-full h-[2px] bg-white/[0.05] rounded" />
        ) : (
          slots.map((s: any) => (
            <div
              key={s.slot}
              className={`flex-1 transition-colors ${
                s.has_block
                  ? s.final
                    ? "h-full bg-emerald-700/55"
                    : "h-full bg-emerald-400/85"
                  : "h-[2px] bg-white/[0.06]"
              } ${s.slot === lastBlockSlot ? "slot-tip" : ""}`}
              title={`slot ${s.slot.toLocaleString()}${s.has_block ? (s.final ? " · finalized block" : " · live block") : " · empty"}`}
            />
          ))
        )}
      </div>

      <div className="flex items-center justify-between mt-2.5 text-[10px] text-zinc-600">
        <span className="tabular-nums">slot {data?.start_slot?.toLocaleString() ?? "—"}</span>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[1px] bg-emerald-700/55" />final</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[1px] bg-emerald-400/85" />live</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[1px] bg-white/[0.08]" />empty</span>
        </div>
        <span className="tabular-nums">tip {data?.tip_slot?.toLocaleString() ?? "—"}</span>
      </div>
    </>
  );

  if (bare) return content;
  return <div className="glass rounded-xl p-4 mb-4 animate-in">{content}</div>;
}
