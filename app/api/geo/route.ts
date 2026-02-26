import { NextRequest, NextResponse } from "next/server";
import { RESTRICTED_COUNTRY_CODES } from "@/lib/jurisdictions";

/**
 * GET /api/geo
 *
 * Returns the visitor's country code based on IP geolocation.
 * Uses Vercel's built-in geo headers (free, no external API needed).
 * Falls back to a lightweight external lookup if headers are missing
 * (e.g. local development).
 *
 * Response: { country: "US", restricted: true }
 */
export async function GET(request: NextRequest) {
  // Vercel injects geo headers automatically on deployed functions
  let country = request.headers.get("x-vercel-ip-country");

  // Fallback for local dev or non-Vercel hosts
  if (!country) {
    try {
      const res = await fetch("https://ipapi.co/json/", {
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        const data = await res.json();
        country = data.country_code || null;
      }
    } catch {
      // Geo lookup failed — don't block, just return unknown
    }
  }

  return NextResponse.json({
    country: country || null,
    restricted: country ? RESTRICTED_COUNTRY_CODES.has(country) : false,
  });
}
