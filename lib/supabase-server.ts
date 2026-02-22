import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * Creates a Supabase client scoped to the current user's session.
 * Used in Server Components, Server Actions, and Route Handlers.
 * RLS policies apply — the user only sees their own data.
 */
export async function createServerSupabase() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Ignored in Server Components (can't set cookies during render).
            // Works fine in Server Actions and Route Handlers.
          }
        },
      },
    }
  );
}

/**
 * Creates an admin Supabase client using the service role / secret key.
 * Uses createClient directly (not the SSR variant) because the SSR
 * helpers don't properly support service role / secret key access.
 * BYPASSES RLS — use only in server-side admin operations.
 * Never import this in client code.
 */
export function createAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
