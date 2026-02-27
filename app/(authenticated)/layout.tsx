import { redirect } from "next/navigation";
import { createServerSupabase, createAdminSupabase } from "@/lib/supabase-server";
import { AuthenticatedShell } from "@/components/AuthenticatedShell";

/**
 * Layout for all authenticated pages (dashboard, settings, admin).
 * Checks auth server-side, then hands off to client shell
 * which provides notification context to sidebar + children.
 */
export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerSupabase();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Check if user is an admin
  const adminSupabase = createAdminSupabase();
  const { data: adminUser } = await adminSupabase
    .from("admin_users")
    .select("id, role")
    .ilike("email", user.email!)
    .single();

  const isAdmin = !!adminUser;
  const adminRole = (adminUser?.role as string) || null;

  return (
    <div className="min-h-screen bg-gray-50">
      <AuthenticatedShell isAdmin={isAdmin} adminRole={adminRole}>
        {children}
      </AuthenticatedShell>
    </div>
  );
}
