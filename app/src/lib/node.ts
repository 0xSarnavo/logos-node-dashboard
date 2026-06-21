const NODE_API = process.env.NODE_API || "http://host.docker.internal:8080";

export async function fetchNode<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${NODE_API}/${path}`, {
      next: { revalidate: 0 },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) return res.json();
  } catch {}
  return null;
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
