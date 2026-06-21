export function SkeletonLine({ w = "w-24", h = "h-4" }: { w?: string; h?: string }) {
  return <div className={`${w} ${h} rounded bg-white/[0.04] shimmer`} />;
}

export function SkeletonRows({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-3 p-5">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-8">
          <div className="w-16 h-3 rounded bg-white/[0.04] shimmer" style={{ animationDelay: `${i * 100}ms` }} />
          <div className="w-32 h-3 rounded bg-white/[0.04] shimmer" style={{ animationDelay: `${i * 100 + 50}ms` }} />
          <div className="flex-1" />
          <div className="w-12 h-3 rounded bg-white/[0.04] shimmer" style={{ animationDelay: `${i * 100 + 100}ms` }} />
        </div>
      ))}
    </div>
  );
}
