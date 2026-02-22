import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/** Shared helper: verify caller is authenticated and an admin */
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
 * GET /api/admin/investors
 *
 * Returns paginated, searchable investor list with aggregated allocation data.
 *
 * Query params:
 *   search - filter by name/email (optional)
 *   page   - zero-indexed page number (default: 0)
 *   limit  - results per page (default: 20)
 */
export async function GET(request: NextRequest) {
  const adminSupabase = await getAdminClient();
  if (!adminSupabase) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Parse query params
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") || "";
  const page = parseInt(searchParams.get("page") || "0");
  const limit = parseInt(searchParams.get("limit") || "20");
  const offset = page * limit;

  // Build the query — fetch investors with their allocation totals
  let query = adminSupabase
    .from("investors")
    .select("id, email, full_name, kyc_status, allocations(token_amount)", {
      count: "exact",
    });

  // Apply search filter (case-insensitive on name or email)
  if (search) {
    query = query.or(
      `full_name.ilike.%${search}%,email.ilike.%${search}%`
    );
  }

  // Apply pagination
  query = query.order("created_at", { ascending: false }).range(offset, offset + limit - 1);

  const { data, count, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Transform: aggregate token amounts and round counts per investor
  const investors = (data || []).map((inv: any) => ({
    id: inv.id,
    email: inv.email,
    full_name: inv.full_name,
    kyc_status: inv.kyc_status,
    total_tokens: (inv.allocations || []).reduce(
      (sum: number, a: any) => sum + Number(a.token_amount),
      0
    ),
    round_count: (inv.allocations || []).length,
  }));

  return NextResponse.json({ investors, total: count || 0 });
}

/**
 * POST /api/admin/investors
 * Manually create a new investor.
 * Body: { email, full_name }
 */
export async function POST(request: NextRequest) {
  const adminSupabase = await getAdminClient();
  if (!adminSupabase) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const email = body.email?.toLowerCase().trim();
  const fullName = body.full_name?.trim();

  if (!email || !fullName) {
    return NextResponse.json(
      { error: "Email and full name are required" },
      { status: 400 }
    );
  }

  const { data, error } = await adminSupabase
    .from("investors")
    .insert({ email, full_name: fullName })
    .select()
    .single();

  if (error) {
    // Duplicate email
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "An investor with this email already exists" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data);
}
