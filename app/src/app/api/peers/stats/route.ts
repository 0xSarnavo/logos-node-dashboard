import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import pool from "@/lib/db";
import { readAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

const CONTINENT_MAP: Record<string, string> = {
  US: "North America", CA: "North America", MX: "North America",
  BR: "South America", AR: "South America", CL: "South America", CO: "South America",
  PE: "South America", VE: "South America", EC: "South America", UY: "South America",
  GB: "Europe", DE: "Europe", FR: "Europe", NL: "Europe", SE: "Europe",
  NO: "Europe", FI: "Europe", DK: "Europe", CH: "Europe", AT: "Europe",
  BE: "Europe", IE: "Europe", PL: "Europe", CZ: "Europe", RO: "Europe",
  PT: "Europe", ES: "Europe", IT: "Europe", GR: "Europe", HU: "Europe",
  BG: "Europe", HR: "Europe", SK: "Europe", SI: "Europe", LT: "Europe",
  LV: "Europe", EE: "Europe", UA: "Europe", RS: "Europe", BA: "Europe",
  RU: "Europe", TR: "Europe", IS: "Europe", LU: "Europe", MT: "Europe",
  CN: "Asia", JP: "Asia", KR: "Asia", IN: "Asia", SG: "Asia",
  HK: "Asia", TW: "Asia", TH: "Asia", VN: "Asia", MY: "Asia",
  ID: "Asia", PH: "Asia", PK: "Asia", BD: "Asia", LK: "Asia",
  AE: "Asia", IL: "Asia", SA: "Asia", QA: "Asia", KW: "Asia",
  AU: "Oceania", NZ: "Oceania",
  ZA: "Africa", NG: "Africa", KE: "Africa", EG: "Africa", GH: "Africa",
  MA: "Africa", TN: "Africa", ET: "Africa", TZ: "Africa",
};

export async function GET() {
  try {
    const { authed } = await readAuth();
    const [byCountry, byIsp, newPeers, bootstrapRes, allPeers] =
      await Promise.all([
        pool.query(`
        SELECT country, country_code, COUNT(*) AS count
        FROM peers
        WHERE country IS NOT NULL
        GROUP BY country, country_code
        ORDER BY count DESC
      `),
        pool.query(`
        SELECT isp, COUNT(*) AS count
        FROM peers
        WHERE isp IS NOT NULL
        GROUP BY isp
        ORDER BY count DESC
        LIMIT 20
      `),
        pool.query(`
        SELECT ip, country, country_code, city, isp, first_seen
        FROM peers
        WHERE first_seen > NOW() - INTERVAL '24 hours'
        ORDER BY first_seen DESC
      `),
        pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE is_bootstrap = TRUE) AS bootstrap,
          COUNT(*) FILTER (WHERE is_bootstrap = FALSE OR is_bootstrap IS NULL) AS regular,
          COUNT(*) AS total
        FROM peers
      `),
        pool.query(`
        SELECT country_code FROM peers WHERE country_code IS NOT NULL
      `),
      ]);

    // Geographic distribution by continent
    const continentCounts: Record<string, number> = {};
    for (const row of allPeers.rows) {
      const cc = row.country_code?.toUpperCase();
      const continent = CONTINENT_MAP[cc] || "Other";
      continentCounts[continent] = (continentCounts[continent] || 0) + 1;
    }
    const continents = Object.entries(continentCounts)
      .map(([name, count]) => ({ continent: name, count }))
      .sort((a, b) => b.count - a.count);

    const br = bootstrapRes.rows[0];

    return NextResponse.json({
      by_country: byCountry.rows.map((r: any) => ({
        country: r.country,
        country_code: r.country_code,
        count: parseInt(r.count),
      })),
      by_isp: byIsp.rows.map((r: any) => ({
        isp: r.isp,
        count: parseInt(r.count),
      })),
      new_peers_24h: newPeers.rows.map((r: any, i: number) => ({
        ip: authed ? r.ip : `peer-${i}`, // hide real IPs from public viewers
        country: r.country,
        country_code: r.country_code, // for the flag (works regardless of IP anonymization)
        city: r.city,
        isp: r.isp,
        first_seen: r.first_seen,
      })),
      new_peers_count: newPeers.rows.length,
      bootstrap: {
        bootstrap: parseInt(br.bootstrap),
        regular: parseInt(br.regular),
        total: parseInt(br.total),
        ratio:
          parseInt(br.total) > 0
            ? Math.round(
                (parseInt(br.bootstrap) / parseInt(br.total)) * 10000
              ) / 100
            : 0,
      },
      continents,
    });
  } catch (e) {
    return apiError(e);
  }
}
