import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Middleware — runs on every matched request before the page renders.
 *
 * Two-layer gate:
 *   1. Jurisdiction check: must have cleared /gate (cookie-based)
 *   2. Auth check: must have a valid Supabase session
 *
 * Flow: /gate → /login → /dashboard
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const path = request.nextUrl.pathname;

  // ── Public routes: always accessible, no checks ──
  if (path === "/gate" || path === "/restricted" || path === "/privacy") {
    return response;
  }

  // ── Layer 1: Jurisdiction gate ──
  // Require portal_jurisdiction cookie on ALL other routes (including /login)
  const jurisdictionCleared = request.cookies.get("portal_jurisdiction");
  if (!jurisdictionCleared) {
    return NextResponse.redirect(new URL("/gate", request.url));
  }

  // ── Layer 2: Auth (Supabase session) ──
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh the session
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Auth callback + login: public after jurisdiction check
  if (path === "/login" || path === "/auth/callback") {
    if (user) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    return response;
  }

  // Everything else requires authentication
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return response;
}

// Run on app routes — skip static files, API routes, etc.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|images|api).*)",
  ],
};
