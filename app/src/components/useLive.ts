"use client";
import useSWR from "swr";

// Throw on non-2xx so an error body (e.g. {error:"..."}) is routed to SWR's `error`, never into
// `data` — otherwise pages dereference fields off the error object and crash (review UI-1/2/3).
const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });

// `url` may be null to conditionally skip fetching (SWR treats a null key as "don't fetch").
export function useLive<T>(url: string | null, interval = 2000) {
  return useSWR<T>(url, fetcher, {
    refreshInterval: interval,
    revalidateOnFocus: true,
    dedupingInterval: 500,
  });
}
