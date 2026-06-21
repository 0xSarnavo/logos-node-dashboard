import Link from "next/link";
import type { Block } from "@/lib/types";

function truncHash(hash: string) {
  if (!hash || hash.length < 20) return hash;
  return hash.slice(0, 10) + "..." + hash.slice(-8);
}

function timeAgo(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

export default function BlockTable({ blocks }: { blocks: Block[] }) {
  if (!blocks.length) {
    return <p className="text-muted text-sm py-8 text-center">No blocks indexed yet...</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-muted text-[11px] uppercase tracking-wider">
            <th className="text-left py-3 px-4 font-medium">Block</th>
            <th className="text-left py-3 px-4 font-medium">Hash</th>
            <th className="text-left py-3 px-4 font-medium">Block Time</th>
            <th className="text-right py-3 px-4 font-medium">Age</th>
          </tr>
        </thead>
        <tbody>
          {blocks.map((block) => (
            <tr
              key={block.height}
              className="border-b border-border/50 hover:bg-white/[0.02] transition-colors"
            >
              <td className="py-3 px-4">
                <Link
                  href={`/blocks/${block.height}`}
                  className="text-white hover:text-subtle transition-colors font-medium"
                >
                  #{block.height.toLocaleString()}
                </Link>
              </td>
              <td className="py-3 px-4">
                <span className="hash text-muted">{truncHash(block.block_hash)}</span>
              </td>
              <td className="py-3 px-4 text-muted">
                {block.block_time_ms
                  ? `${(block.block_time_ms / 1000).toFixed(1)}s`
                  : "—"}
              </td>
              <td className="py-3 px-4 text-right text-muted">
                {timeAgo(block.ts)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
