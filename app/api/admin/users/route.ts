import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * Verify the caller is an admin or super_admin (not manager).
 * Returns { client, role } or null if unauthorized.
 */
async function getAdminOnlyClient() {
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

  // Only admin and super_admin can manage other admins — managers cannot
  const { data } = await adminSupabase
    .from("admin_users")
    .select("id, role")
    .ilike("email", user.email!)
    .single();

  if (!data || data.role === "manager") return null;

  return { client: adminSupabase, role: data.role as string };
}

/**
 * GET /api/admin/users — List all admin users
 */
export async function GET() {
  const result = await getAdminOnlyClient();
  if (!result) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await result.client
    .from("admin_users")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

/**
 * POST /api/admin/users — Add a new admin/manager
 * Body: { email, role }
 */
export async function POST(request: NextRequest) {
  const result = await getAdminOnlyClient();
  if (!result) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const email = body.email?.toLowerCase().trim();
  const role = body.role;

  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  // Validate role
  if (!["super_admin", "admin", "manager"].includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  // Only super_admin can create other super_admins
  if (role === "super_admin" && result.role !== "super_admin") {
    return NextResponse.json(
      { error: "Only super admins can create other super admins" },
      { status: 403 }
    );
  }

  const { data, error } = await result.client
    .from("admin_users")
    .insert({ email, role })
    .select()
    .single();

  if (error) {
    // Likely a duplicate email
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "This email is already an admin" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data);
}

/**
 * PATCH /api/admin/users — Update an admin user's role
 * Body: { id, role }
 */
export async function PATCH(request: NextRequest) {
  const result = await getAdminOnlyClient();
  if (!result) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { id, role } = body;

  if (!id || !role) {
    return NextResponse.json({ error: "Missing id or role" }, { status: 400 });
  }

  if (!["super_admin", "admin", "manager"].includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  // Only super_admin can promote to super_admin
  if (role === "super_admin" && result.role !== "super_admin") {
    return NextResponse.json(
      { error: "Only super admins can set super admin role" },
      { status: 403 }
    );
  }

  const { data, error } = await result.client
    .from("admin_users")
    .update({ role })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data);
}

/**
 * DELETE /api/admin/users?id=<admin_user_id>
 * Remove an admin user
 */
export async function DELETE(request: NextRequest) {
  const result = await getAdminOnlyClient();
  if (!result) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  // Prevent deleting yourself
  const { data: target } = await result.client
    .from("admin_users")
    .select("role")
    .eq("id", id)
    .single();

  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Only super_admin can remove other super_admins
  if (target.role === "super_admin" && result.role !== "super_admin") {
    return NextResponse.json(
      { error: "Only super admins can remove other super admins" },
      { status: 403 }
    );
  }

  const { error } = await result.client
    .from("admin_users")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
