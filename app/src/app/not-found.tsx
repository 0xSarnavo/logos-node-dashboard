import Link from "next/link";

// 404 boundary (ADD-3) — shown for unknown routes / missing blocks & transactions.
export default function NotFound() {
  return (
    <div className="px-6 py-20 mx-auto max-w-md text-center">
      <h2 className="text-lg font-semibold text-white mb-2">Not found</h2>
      <p className="text-sm text-zinc-500 mb-6">That page, block, or transaction doesn&apos;t exist.</p>
      <Link
        href="/"
        className="px-4 py-2 rounded-md bg-white/[0.06] border border-white/[0.1] text-sm text-zinc-200 hover:bg-white/[0.1] transition-colors"
      >
        Back home
      </Link>
    </div>
  );
}
