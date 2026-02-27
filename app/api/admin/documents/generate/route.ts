import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/admin-auth";
import { generateDocsForInvestor } from "@/lib/doc-generate-core";

/**
 * POST /api/admin/documents/generate
 * Generate (or re-generate) the full document set for an investor + round.
 *
 * Body: { investor_id, round_id }
 *
 * Pre-requisite: allocation must exist for this investor + round.
 * On re-generation: voids existing documents, creates fresh set.
 */
export async function POST(request: NextRequest) {
  const auth = await getAdminAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!auth.canWrite) {
    return NextResponse.json({ error: "Staff cannot generate documents" }, { status: 403 });
  }

  const { investor_id, round_id } = await request.json();
  if (!investor_id || !round_id) {
    return NextResponse.json({ error: "investor_id and round_id required" }, { status: 400 });
  }

  // Fetch investor
  const { data: investor, error: invErr } = await auth.client
    .from("investors")
    .select("*")
    .eq("id", investor_id)
    .single();

  if (invErr || !investor) {
    return NextResponse.json({ error: "Investor not found" }, { status: 404 });
  }

  try {
    const result = await generateDocsForInvestor(
      auth.client,
      investor,
      round_id,
      auth.email
    );

    return NextResponse.json({
      success: true,
      documents: result.documents,
      missing_variables: result.missingVars,
      email_sent: result.emailSent,
      voided_count: result.voidedCount,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
