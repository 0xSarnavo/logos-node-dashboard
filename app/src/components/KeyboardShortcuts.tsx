"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function KeyboardShortcuts() {
  const router = useRouter();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't fire when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key.toLowerCase()) {
        case "h": router.push("/"); break;
        case "b": router.push("/blocks"); break;
        case "e": router.push("/transactions"); break;
        case "n": router.push("/node"); break;
        case "/": e.preventDefault(); document.querySelector<HTMLInputElement>("input[type=text]")?.focus(); break;
        case "escape": (document.activeElement as HTMLElement)?.blur(); break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [router]);

  return null;
}
