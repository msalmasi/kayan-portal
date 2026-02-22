import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

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
    .eq("email", user.email)
    .single();

  return data ? adminSupabase : null;
}

/**
 * GET /api/admin/rounds — List all SAFT rounds
 */
export async function GET() {
  const supabase = await getAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("saft_rounds")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

/**
 * POST /api/admin/rounds — Create a new round
 * Body: { name, token_price?, tge_unlock_pct, cliff_months, vesting_months }
 */
export async function POST(request: NextRequest) {
  const supabase = await getAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();

  const { data, error } = await supabase
    .from("saft_rounds")
    .insert({
      name: body.name,
      token_price: body.token_price || null,
      tge_unlock_pct: body.tge_unlock_pct || 0,
      cliff_months: body.cliff_months || 0,
      vesting_months: body.vesting_months,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data);
}

/**
 * PATCH /api/admin/rounds — Update an existing round
 * Body: { id, ...fields }
 */
export async function PATCH(request: NextRequest) {
  const supabase = await getAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { id, ...updates } = body;

  if (!id) {
    return NextResponse.json({ error: "Missing round id" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("saft_rounds")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data);
}

/**
 * DELETE /api/admin/rounds — Remove a round (cascades to allocations)
 * Query: ?id=<round_id>
 */
export async function DELETE(request: NextRequest) {
  const supabase = await getAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Missing round id" }, { status: 400 });
  }

  const { error } = await supabase.from("saft_rounds").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
