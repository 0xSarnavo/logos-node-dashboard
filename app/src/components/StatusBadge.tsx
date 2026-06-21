// Shared status pill — consolidates the StatusBadge defined identically in 3 pages (Q-9).
export function StatusBadge({ status, large }: { status: string; large?: boolean }) {
  return <span className={`badge badge-${status} ${large ? "text-[11px] px-3 py-1" : ""}`}>{status}</span>;
}

export default StatusBadge;
