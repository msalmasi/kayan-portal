import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/admin-auth";

/**
 * GET /api/admin/investors
 * Returns paginated, searchable investor list with aggregated allocation data.
 */
export async function GET(request: NextRequest) {
  const auth = await getAdminAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") || "";
  const page = parseInt(searchParams.get("page") || "0");
  const limit = parseInt(searchParams.get("limit") || "20");
  const offset = page * limit;

  let query = auth.client
    .from("investors")
    .select("id, email, full_name, kyc_status, allocations(token_amount)", {
      count: "exact",
    });

  if (search) {
    query = query.or(
      `full_name.ilike.%${search}%,email.ilike.%${search}%`
    );
  }

  query = query.order("created_at", { ascending: false }).range(offset, offset + limit - 1);

  const { data, count, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

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
 * Manually create a new investor. Staff cannot access.
 */
export async function POST(request: NextRequest) {
  const auth = await getAdminAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!auth.canWrite) {
    return NextResponse.json({ error: "Staff have view-only access" }, { status: 403 });
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

  const { data, error } = await auth.client
    .from("investors")
    .insert({ email, full_name: fullName })
    .select()
    .single();

  if (error) {
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
