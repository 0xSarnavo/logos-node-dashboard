import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { fetchNode } from "@/lib/node";
import { readAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

// This node's identity + approximate location. The node binds only private addresses locally,
// so we geolocate the server's public egress IP. peer_id is a public network identifier and is
// always returned; the raw IP is only returned to authenticated viewers.
let cached: Record<string, any> | null = null;
let cachedAt = 0;
const TTL = 10 * 60 * 1000;

export async function GET() {
  try {
    const { authed } = await readAuth();
    // Hide this node entirely from public viewers — no identity, location, or peer_id.
    if (!authed) return NextResponse.json({});

    if (!cached || Date.now() - cachedAt >= TTL) {
      const [geo, netInfo] = await Promise.all([
        fetch(
          "http://ip-api.com/json/?fields=status,country,countryCode,region,regionName,city,timezone,isp,org,as,lat,lon,query",
          { signal: AbortSignal.timeout(8000) }
        ).then((r) => r.json()).catch(() => null),
        fetchNode<any>("network/info").catch(() => null),
      ]);
      if (!geo || geo.status !== "success") {
        return NextResponse.json({ error: "geolocation unavailable" }, { status: 502 });
      }
      cached = {
        ip: geo.query,
        peer_id: netInfo?.peer_id ?? null, // public network identifier
        lat: geo.lat,
        lon: geo.lon,
        city: geo.city,
        region: geo.regionName,
        country: geo.country,
        country_code: geo.countryCode,
        timezone: geo.timezone,
        isp: geo.isp,
        org: geo.org,
        asn: geo.as, // e.g. "AS24560 Bharti Airtel Ltd."
      };
      cachedAt = Date.now();
    }

    return NextResponse.json(cached);
  } catch (e) {
    return apiError(e);
  }
}
