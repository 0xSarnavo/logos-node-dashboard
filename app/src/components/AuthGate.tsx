"use client";
import { type ReactNode } from "react";
import { useAuth } from "@/components/AuthProvider";

// Wraps a private page: shows its content only when signed in, otherwise a centered
// "sign in to view" gate. The underlying data routes are 401-protected server-side too.
export default function AuthGate({ children }: { children: ReactNode }) {
  const { authed, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-[12px] text-zinc-600">
        Loading…
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
        <div className="glass rounded-xl p-8 max-w-sm w-full">
          <svg className="w-8 h-8 mx-auto mb-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
          </svg>
          <h2 className="text-[15px] font-semibold text-white mb-1.5">Sign in to view this page</h2>
          <p className="text-[12px] text-zinc-500 leading-relaxed">
            This is a private operator view. Use the profile icon in the top-right corner to sign in.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
