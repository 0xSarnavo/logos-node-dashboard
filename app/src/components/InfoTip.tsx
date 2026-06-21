// Shared info tooltip — a proper circled-"i" icon with a content-sized hover tooltip.
// Used site-wide so the icon + tooltip look identical everywhere.
export function InfoTip({ text, align = "left" }: { text: string; align?: "left" | "right" }) {
  return (
    <span className="info-tip info-tip-ic" data-align={align}>
      <svg className="info-tip-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4m0-4h.01" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="tip-text">{text}</span>
    </span>
  );
}

export default InfoTip;
