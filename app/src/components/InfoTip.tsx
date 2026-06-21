"use client";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";

// Shared info tooltip — a circled "i" icon with a fixed-position, viewport-clamped tooltip.
// Rendered through a portal to <body> so it is never clipped by a card's overflow:hidden and
// never pushed off-screen (it flips below / clamps horizontally to stay fully in view).
export function InfoTip({ text, align = "left" }: { text: string; align?: "left" | "right" }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; flip: boolean } | null>(null);

  const show = () => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const m = 8;
    const vw = window.innerWidth;
    const width = Math.min(264, vw - m * 2);
    let left = r.left + r.width / 2 - width / 2;
    left = Math.max(m, Math.min(left, vw - width - m)); // clamp inside viewport
    const flip = r.top < 110; // not enough room above → drop below the icon
    const top = flip ? r.bottom + m : r.top - m;
    setPos({ top, left, width, flip });
  };
  const hide = () => setPos(null);

  return (
    <span
      ref={ref}
      className="info-tip-ic"
      data-align={align}
      onMouseEnter={show}
      onMouseLeave={hide}
      onClick={(e) => { e.stopPropagation(); pos ? hide() : show(); }}
    >
      <svg className="info-tip-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4m0-4h.01" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {pos && typeof document !== "undefined" && createPortal(
        <span
          className="tip-text-fixed"
          style={{
            top: pos.top,
            left: pos.left,
            width: pos.width,
            transform: pos.flip ? "none" : "translateY(-100%)",
          }}
        >
          {text}
        </span>,
        document.body,
      )}
    </span>
  );
}

export default InfoTip;
