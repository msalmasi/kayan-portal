import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

/**
 * GET /auth/callback
 *
 * Handles TWO types of Supabase auth redirects:
 *
 * 1. Magic link sign-in → has `code` param
 *    Exchange the code for a session, redirect to dashboard.
 *
 * 2. Email confirmation (new signup) → has `token_hash` + `type` params
 *    Verify the token to confirm the email AND create a session,
 *    then redirect to dashboard (no second login needed).
 *
 * 3. Error or expired link → has `error` + `error_description` params
 *    Redirect to login with a descriptive error.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);

  // -- Check for Supabase error params (expired/invalid links) --
  const errorParam = searchParams.get("error");
  const errorDesc = searchParams.get("error_description");
  if (errorParam) {
    const message = encodeURIComponent(
      errorDesc || "This link is invalid or has expired."
    );
    return NextResponse.redirect(`${origin}/login?error=${message}`);
  }

  const cookieStore = cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );

  const next = searchParams.get("next") ?? "/dashboard";

  // -- Path 1: Magic link (code exchange) --
  const code = searchParams.get("code");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }

    // Code was already used or expired
    const message = encodeURIComponent(
      "This sign-in link has expired or was already used. Please request a new one."
    );
    return NextResponse.redirect(`${origin}/login?error=${message}`);
  }

  // -- Path 2: Email confirmation (token_hash + type) --
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as any;

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });

    if (!error) {
      // Email confirmed AND session created — go straight to dashboard
      return NextResponse.redirect(`${origin}${next}`);
    }

    const message = encodeURIComponent(
      "This confirmation link has expired or was already used. Please sign in below to receive a new link."
    );
    return NextResponse.redirect(`${origin}/login?error=${message}`);
  }

  // -- No recognizable params at all --
  const message = encodeURIComponent(
    "Invalid sign-in link. Please request a new one below."
  );
  return NextResponse.redirect(`${origin}/login?error=${message}`);
}
