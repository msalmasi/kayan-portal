import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Middleware runs on every matched request before the page renders.
 * Responsibilities:
 *   1. Refresh the Supabase auth session (keeps tokens fresh)
 *   2. Redirect unauthenticated users to /login
 *   3. Redirect authenticated non-investors to an error page
 *   4. Let admin routes handle their own authorization server-side
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Create a Supabase client that can read/write auth cookies
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
          // Forward cookie changes to both the request and response
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

  // Refresh the session — this is critical for keeping auth alive
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  // Public routes that don't need auth
  if (path === "/login" || path === "/auth/callback") {
    // If already logged in, redirect to dashboard
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

// Only run middleware on app routes (skip static files, API routes, etc.)
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|images|api/auth).*)",
  ],
};
