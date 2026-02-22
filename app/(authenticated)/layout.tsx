import { redirect } from "next/navigation";
import { createServerSupabase, createAdminSupabase } from "@/lib/supabase-server";
import { Sidebar } from "@/components/ui/Sidebar";

/**
 * Layout for all authenticated pages (dashboard, settings, admin).
 * Checks auth and renders the sidebar + content structure.
 */
export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerSupabase();

  // Verify the user is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Check if user is an admin (for showing the admin nav link)
  const adminSupabase = createAdminSupabase();
  const { data: adminUser } = await adminSupabase
    .from("admin_users")
    .select("id")
    .ilike("email", user.email!)
    .single();

  const isAdmin = !!adminUser;

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar isAdmin={isAdmin} />

      {/* Main content — offset by sidebar width on desktop */}
      <main className="lg:ml-64 min-h-screen">
        <div className="p-6 lg:p-8 pt-16 lg:pt-8 max-w-6xl">
          {children}
        </div>
      </main>
    </div>
  );
}
