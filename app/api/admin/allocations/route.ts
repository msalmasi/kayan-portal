import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/** Verify admin access — same pattern as other admin routes */
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

  const { data } = await adminSupabase
    .from("admin_users")
    .select("id")
    .ilike("email", user.email!)
    .single();

  return data ? adminSupabase : null;
}

/**
 * POST /api/admin/allocations
 * Create a new allocation (link investor to a round).
 * Body: { investor_id, round_id, token_amount, notes? }
 */
export async function POST(request: NextRequest) {
  const supabase = await getAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();

  const { data, error } = await supabase
    .from("allocations")
    .insert({
      investor_id: body.investor_id,
      round_id: body.round_id,
      token_amount: body.token_amount,
      notes: body.notes || null,
    })
    .select("*, saft_rounds(*)")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data);
}

/**
 * DELETE /api/admin/allocations?id=<allocation_id>
 * Remove an allocation.
 */
export async function DELETE(request: NextRequest) {
  const supabase = await getAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Missing allocation id" }, { status: 400 });
  }

  const { error } = await supabase.from("allocations").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
