"use client";

// Route-segment error boundary (ADD-3) — keeps a thrown render/server error from blanking the app.
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="px-6 py-20 mx-auto max-w-md text-center">
      <h2 className="text-lg font-semibold text-white mb-2">Something went wrong</h2>
      <p className="text-sm text-zinc-500 mb-6">An unexpected error occurred while loading this page.</p>
      <button
        onClick={reset}
        className="px-4 py-2 rounded-md bg-white/[0.06] border border-white/[0.1] text-sm text-zinc-200 hover:bg-white/[0.1] transition-colors"
      >
        Try again
      </button>
    </div>
  );
}
