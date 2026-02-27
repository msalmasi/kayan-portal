import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import crypto from "crypto";

/**
 * POST /api/investor/kyc/token
 *
 * Generates a Sumsub access token for the currently logged-in investor.
 * The token is passed to the Sumsub Web SDK on the frontend to launch
 * the embedded verification widget.
 *
 * Env vars required:
 *   SUMSUB_APP_TOKEN  — your Sumsub app-level token
 *   SUMSUB_SECRET_KEY — your Sumsub secret key for signing requests
 *
 * Flow:
 *   1. Identify the logged-in user via Supabase auth
 *   2. Look up their investor record
 *   3. Call Sumsub's /resources/accessTokens to get a short-lived token
 *   4. Return the token to the frontend
 */
export async function POST(request: NextRequest) {
  const appToken = process.env.SUMSUB_APP_TOKEN;
  const secretKey = process.env.SUMSUB_SECRET_KEY;

  if (!appToken || !secretKey) {
    return NextResponse.json(
      { error: "Sumsub credentials not configured" },
      { status: 500 }
    );
  }

  // ── 1. Get the current investor ──
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: investor } = await supabase
    .from("investors")
    .select("id, email, kyc_status, sumsub_applicant_id")
    .ilike("email", user.email)
    .single();

  if (!investor) {
    return NextResponse.json({ error: "Investor not found" }, { status: 404 });
  }

  // Already verified — no need for a new token
  if (investor.kyc_status === "verified") {
    return NextResponse.json(
      { error: "KYC already verified" },
      { status: 400 }
    );
  }

  // ── 2. Build the Sumsub API request ──
  // We use the investor's email as externalUserId so the webhook
  // can match the result back to our investor record.
  const externalUserId = investor.email.toLowerCase();
  const levelName = process.env.SUMSUB_LEVEL_NAME || "kayan-reg-s";

  const url = `/resources/accessTokens?userId=${encodeURIComponent(
    externalUserId
  )}&levelName=${encodeURIComponent(levelName)}`;

  try {
    const token = await sumsubRequest("POST", url, appToken, secretKey);
    return NextResponse.json({ token: token.token, userId: externalUserId });
  } catch (err: any) {
    console.error("[KYC] Sumsub token generation failed:", err.message);
    return NextResponse.json(
      { error: "Failed to generate KYC token" },
      { status: 502 }
    );
  }
}

// ─── Sumsub signed request helper ────────────────────────────
// Sumsub requires HMAC-SHA256 signed requests with specific headers.

async function sumsubRequest(
  method: string,
  path: string,
  appToken: string,
  secretKey: string,
  body?: string
) {
  const baseUrl = "https://api.sumsub.com";
  const ts = Math.floor(Date.now() / 1000).toString();

  // Signature = HMAC-SHA256(ts + method + path + body)
  const sigPayload = ts + method.toUpperCase() + path + (body || "");
  const signature = crypto
    .createHmac("sha256", secretKey)
    .update(sigPayload)
    .digest("hex");

  const headers: Record<string, string> = {
    "X-App-Token": appToken,
    "X-App-Access-Sig": signature,
    "X-App-Access-Ts": ts,
    Accept: "application/json",
  };

  if (body) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body || undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sumsub API ${res.status}: ${text}`);
  }

  return res.json();
}
