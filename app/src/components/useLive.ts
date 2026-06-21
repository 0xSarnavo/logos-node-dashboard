"use client";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useLive<T>(url: string, interval = 2000) {
  return useSWR<T>(url, fetcher, {
    refreshInterval: interval,
    revalidateOnFocus: true,
    dedupingInterval: 500,
  });
}
