import { redirect } from "next/navigation";
import { createServerSupabase, createAdminSupabase } from "@/lib/supabase-server";

/**
 * Admin layout — double protection:
 *   1. Middleware ensures the user is authenticated
 *   2. This layout verifies they're in the admin_users table
 *
 * Uses the service role key to check admin_users (RLS blocks client access).
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerSupabase();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) redirect("/login");

  // Check admin status using service role (bypasses RLS)
  const adminSupabase = createAdminSupabase();
  const { data: adminUser } = await adminSupabase
    .from("admin_users")
    .select("id, role")
    .ilike("email", user.email!)
    .single();

  // Not an admin — redirect to dashboard
  if (!adminUser) redirect("/dashboard");

  return <>{children}</>;
}
