import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/admin-auth";

/**
 * Permission matrix for /api/admin/users:
 *
 *   super_admin → GET, POST, PATCH, DELETE (all roles)
 *   admin       → GET, POST, PATCH, DELETE (cannot touch super_admins)
 *   manager     → GET only (view team list)
 *   staff       → 403 on everything (no access)
 */

/**
 * GET /api/admin/users — List all admin users
 * Accessible by: super_admin, admin, manager
 * Blocked for: staff
 */
export async function GET() {
  const auth = await getAdminAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Staff cannot view the team page at all
  if (auth.role === "staff") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await auth.client
    .from("admin_users")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

/**
 * POST /api/admin/users — Add a new team member
 * Accessible by: super_admin, admin
 * Blocked for: manager, staff
 */
export async function POST(request: NextRequest) {
  const auth = await getAdminAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Only admin and super_admin can add team members
  if (auth.role !== "admin" && auth.role !== "super_admin") {
    return NextResponse.json(
      { error: "Only admins can manage team members" },
      { status: 403 }
    );
  }

  const body = await request.json();
  const email = body.email?.toLowerCase().trim();
  const role = body.role;

  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  if (!["super_admin", "admin", "manager", "staff"].includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  // Only super_admin can create other super_admins
  if (role === "super_admin" && auth.role !== "super_admin") {
    return NextResponse.json(
      { error: "Only super admins can create other super admins" },
      { status: 403 }
    );
  }

  // Admins cannot create other admins — only super_admin can
  if (role === "admin" && auth.role !== "super_admin") {
    return NextResponse.json(
      { error: "Only super admins can create other admins" },
      { status: 403 }
    );
  }

  const { data, error } = await auth.client
    .from("admin_users")
    .insert({ email, role })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "This email is already a team member" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data);
}

/**
 * PATCH /api/admin/users — Update a team member's role
 * Accessible by: super_admin, admin
 * Blocked for: manager, staff
 */
export async function PATCH(request: NextRequest) {
  const auth = await getAdminAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (auth.role !== "admin" && auth.role !== "super_admin") {
    return NextResponse.json(
      { error: "Only admins can manage team members" },
      { status: 403 }
    );
  }

  const body = await request.json();
  const { id, role } = body;

  if (!id || !role) {
    return NextResponse.json({ error: "Missing id or role" }, { status: 400 });
  }

  if (!["super_admin", "admin", "manager", "staff"].includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  // Look up the target user to enforce escalation rules
  const { data: target } = await auth.client
    .from("admin_users")
    .select("role")
    .eq("id", id)
    .single();

  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Only super_admin can modify super_admins or promote to super_admin/admin
  if (
    (target.role === "super_admin" || target.role === "admin") &&
    auth.role !== "super_admin"
  ) {
    return NextResponse.json(
      { error: "Only super admins can modify admin or super admin users" },
      { status: 403 }
    );
  }

  if (
    (role === "super_admin" || role === "admin") &&
    auth.role !== "super_admin"
  ) {
    return NextResponse.json(
      { error: "Only super admins can promote to admin or super admin" },
      { status: 403 }
    );
  }

  const { data, error } = await auth.client
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
 * Accessible by: super_admin, admin
 * Blocked for: manager, staff
 */
export async function DELETE(request: NextRequest) {
  const auth = await getAdminAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (auth.role !== "admin" && auth.role !== "super_admin") {
    return NextResponse.json(
      { error: "Only admins can manage team members" },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const { data: target } = await auth.client
    .from("admin_users")
    .select("role")
    .eq("id", id)
    .single();

  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Only super_admin can remove admins or other super_admins
  if (
    (target.role === "super_admin" || target.role === "admin") &&
    auth.role !== "super_admin"
  ) {
    return NextResponse.json(
      { error: "Only super admins can remove admin or super admin users" },
      { status: 403 }
    );
  }

  const { error } = await auth.client
    .from("admin_users")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
