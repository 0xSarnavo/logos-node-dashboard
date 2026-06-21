const NODE_API = process.env.NODE_API || "http://host.docker.internal:8080";

// Coalesce identical node GETs and cache them for 1s, so multiple API routes serving one
// page load (home hits cryptarchia/info from 3 routes) make a single node request (PERF-7).
const TTL_MS = 1000;
const _cache = new Map<string, { t: number; v: any }>();
const _inflight = new Map<string, Promise<any>>();

export async function fetchNode<T>(path: string): Promise<T | null> {
  const hit = _cache.get(path);
  if (hit && Date.now() - hit.t < TTL_MS) return hit.v as T | null;
  const flying = _inflight.get(path);
  if (flying) return flying as Promise<T | null>;

  const p = (async () => {
    try {
      const res = await fetch(`${NODE_API}/${path}`, {
        next: { revalidate: 0 },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const v = await res.json();
        _cache.set(path, { t: Date.now(), v });
        return v;
      }
    } catch {}
    return null;
  })().finally(() => { _inflight.delete(path); });

  _inflight.set(path, p);
  return p;
}

// POST helper — the node's storage endpoints (e.g. /storage/block) take a JSON body.
export async function fetchNodePost<T>(path: string, body: any): Promise<T | null> {
  try {
    const res = await fetch(`${NODE_API}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      next: { revalidate: 0 },
      signal: AbortSignal.timeout(6000),
    });
    if (res.ok) return res.json();
  } catch {}
  return null;
}
