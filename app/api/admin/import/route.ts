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
    .ilike("email", user.email!)
    .single();

  return data ? adminSupabase : null;
}

interface ImportRow {
  email: string;
  full_name: string;
  round_name: string;
  token_amount: number;
}

/**
 * POST /api/admin/import
 * Processes CSV data for bulk import.
 *
 * Upsert logic:
 *   - If investor email exists → reuse existing investor (don't duplicate)
 *   - If round_name doesn't match → return error for that row
 *   - Creates new investor records as needed
 *   - Always creates new allocation records
 *
 * Body: { rows: ImportRow[] }
 */
export async function POST(request: NextRequest) {
  const supabase = await getAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { rows } = (await request.json()) as { rows: ImportRow[] };

  if (!rows || rows.length === 0) {
    return NextResponse.json({ error: "No data to import" }, { status: 400 });
  }

  // Fetch all existing rounds for name matching
  const { data: rounds } = await supabase.from("saft_rounds").select("*");
  const roundMap = new Map(
    (rounds || []).map((r: any) => [r.name.toLowerCase().trim(), r])
  );

  // Fetch all existing investors for email matching
  const { data: existingInvestors } = await supabase
    .from("investors")
    .select("id, email");
  const investorMap = new Map(
    (existingInvestors || []).map((i: any) => [i.email.toLowerCase().trim(), i])
  );

  const results = {
    created_investors: 0,
    created_allocations: 0,
    skipped: 0,
    errors: [] as { row: number; message: string }[],
  };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const email = row.email?.toLowerCase().trim();
    const roundName = row.round_name?.toLowerCase().trim();

    // Validate required fields
    if (!email || !row.full_name || !roundName || !row.token_amount) {
      results.errors.push({ row: i + 1, message: "Missing required fields" });
      results.skipped++;
      continue;
    }

    // Match round by name
    const round = roundMap.get(roundName);
    if (!round) {
      results.errors.push({
        row: i + 1,
        message: `Round "${row.round_name}" not found`,
      });
      results.skipped++;
      continue;
    }

    // Upsert investor: reuse if exists, create if new
    let investorId: string;
    const existing = investorMap.get(email);

    if (existing) {
      investorId = existing.id;
    } else {
      const { data: newInvestor, error } = await supabase
        .from("investors")
        .insert({ email, full_name: row.full_name.trim() })
        .select("id")
        .single();

      if (error || !newInvestor) {
        results.errors.push({
          row: i + 1,
          message: `Failed to create investor: ${error?.message}`,
        });
        results.skipped++;
        continue;
      }

      investorId = newInvestor.id;
      investorMap.set(email, newInvestor);
      results.created_investors++;
    }

    // Create the allocation
    const { error: allocError } = await supabase.from("allocations").insert({
      investor_id: investorId,
      round_id: round.id,
      token_amount: Number(row.token_amount),
    });

    if (allocError) {
      results.errors.push({
        row: i + 1,
        message: `Failed to create allocation: ${allocError.message}`,
      });
      results.skipped++;
      continue;
    }

    results.created_allocations++;
  }

  return NextResponse.json(results);
}
