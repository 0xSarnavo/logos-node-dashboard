interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  mono?: boolean;
  live?: boolean;
}

export default function StatCard({ label, value, sub, mono, live }: StatCardProps) {
  return (
    <div className="bg-surface border border-border rounded-lg p-4 animate-in">
      <div className="flex items-center gap-2 mb-2">
        {live && <div className="w-1.5 h-1.5 rounded-full bg-white live-dot" />}
        <p className="text-[11px] text-muted uppercase tracking-wider font-medium">{label}</p>
      </div>
      <p className={`text-2xl font-semibold tracking-tight ${mono ? "hash" : ""}`}>
        {value}
      </p>
      {sub && <p className="text-xs text-muted mt-1">{sub}</p>}
    </div>
  );
}
