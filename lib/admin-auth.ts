import { createServerClient } from "@supabase/ssr";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

interface AdminAuth {
  client: SupabaseClient;
  role: string;
  canWrite: boolean;
  email: string;
}

/**
 * Shared helper: verify caller is authenticated and an admin.
 * Returns { client, role, canWrite } or null if unauthorized.
 *
 * canWrite is false for staff (view-only role).
 */
export async function getAdminAuth(): Promise<AdminAuth | null> {
  const cookieStore = cookies();

  const userSupabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} },
    }
  );

  const {
    data: { user },
  } = await userSupabase.auth.getUser();
  if (!user?.email) return null;

  const adminSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data } = await adminSupabase
    .from("admin_users")
    .select("id, role")
    .ilike("email", user.email!)
    .single();

  if (!data) return null;

  return {
    client: adminSupabase,
    role: data.role as string,
    canWrite: data.role !== "staff",
    email: user.email!,
  };
}
