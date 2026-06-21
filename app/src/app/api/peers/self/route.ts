import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Approximate this node's location by geolocating the server's public egress IP.
// (The node only binds private addresses locally, so this is the closest signal we have.)
let cached: Record<string, any> | null = null;
let cachedAt = 0;
const TTL = 10 * 60 * 1000;

export async function GET() {
  try {
    if (cached && Date.now() - cachedAt < TTL) return NextResponse.json(cached);
    const res = await fetch(
      "http://ip-api.com/json/?fields=status,country,countryCode,region,regionName,city,timezone,isp,org,as,lat,lon,query",
      { signal: AbortSignal.timeout(8000) }
    );
    const d = await res.json();
    if (d.status !== "success") {
      return NextResponse.json({ error: "geolocation unavailable" }, { status: 502 });
    }
    cached = {
      ip: d.query,
      lat: d.lat,
      lon: d.lon,
      city: d.city,
      region: d.regionName,
      country: d.country,
      country_code: d.countryCode,
      timezone: d.timezone,
      isp: d.isp,
      org: d.org,
      asn: d.as, // e.g. "AS24560 Bharti Airtel Ltd."
    };
    cachedAt = Date.now();
    return NextResponse.json(cached);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
