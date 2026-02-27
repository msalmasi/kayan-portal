import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * GET /api/investor/documents
 * Returns all documents for the authenticated investor, grouped by round.
 */
export async function GET() {
  const cookieStore = cookies();

  const userSupabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );

  const { data: { user } } = await userSupabase.auth.getUser();
  if (!user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Use service role to query
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Get investor
  const { data: investor } = await admin
    .from("investors")
    .select("id")
    .ilike("email", user.email)
    .single();

  if (!investor) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Fetch all documents (excluding html_content for list view)
  const { data: docs, error } = await admin
    .from("investor_documents")
    .select("id, doc_type, round_id, status, signed_at, created_at, saft_rounds(name)")
    .eq("investor_id", investor.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(docs || []);
}
