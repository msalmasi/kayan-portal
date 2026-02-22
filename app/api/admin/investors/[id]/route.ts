import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * Helper: verify the caller is an authenticated admin.
 * Returns the admin Supabase client or null if unauthorized.
 */
async function getAdminClient() {
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

  const { data: adminUser } = await adminSupabase
    .from("admin_users")
    .select("id")
    .ilike("email", user.email!)
    .single();

  return adminUser ? adminSupabase : null;
}

/**
 * GET /api/admin/investors/[id]
 * Fetch a single investor with their allocations and round details.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await getAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: investor, error } = await supabase
    .from("investors")
    .select("*, allocations(*, saft_rounds(*))")
    .eq("id", params.id)
    .single();

  if (error || !investor) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(investor);
}

/**
 * PATCH /api/admin/investors/[id]
 * Update investor fields (name, email, kyc_status).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await getAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();

  // Only allow updating specific fields
  const allowed = ["full_name", "email", "kyc_status"];
  const updates: Record<string, any> = {};
  for (const key of allowed) {
    if (body[key] !== undefined) updates[key] = body[key];
  }

  const { data, error } = await supabase
    .from("investors")
    .update(updates)
    .eq("id", params.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data);
}
