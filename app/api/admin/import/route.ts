import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/admin-auth";

interface ImportRow {
  email: string;
  full_name: string;
  round_name: string;
  token_amount: number;
}

/**
 * POST /api/admin/import
 * Processes CSV data for bulk import. Staff cannot access.
 */
export async function POST(request: NextRequest) {
  const auth = await getAdminAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!auth.canWrite) {
    return NextResponse.json({ error: "Staff have view-only access" }, { status: 403 });
  }

  const { rows } = (await request.json()) as { rows: ImportRow[] };

  if (!rows || rows.length === 0) {
    return NextResponse.json({ error: "No data to import" }, { status: 400 });
  }

  // Fetch all existing rounds for name matching
  const { data: rounds } = await auth.client.from("saft_rounds").select("*");
  const roundMap = new Map(
    (rounds || []).map((r: any) => [r.name.toLowerCase().trim(), r])
  );

  // Fetch all existing investors for email matching
  const { data: existingInvestors } = await auth.client
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
      const { data: newInvestor, error } = await auth.client
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
    const { error: allocError } = await auth.client.from("allocations").insert({
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

  // Prompt investors with approved PQs to update
  try {
    const investorIds = Array.from(new Set(
      Array.from(investorMap.values()).map((inv: any) => inv.id)
    ));

    if (investorIds.length > 0) {
      const { data: approvedInvestors } = await auth.client
        .from("investors")
        .select("id, full_name, email, pq_status")
        .in("id", investorIds)
        .eq("pq_status", "approved");

      if (approvedInvestors?.length) {
        const { sendEmail, composePqUpdatePromptEmail } = await import("@/lib/email");
        const importRoundName = "a new round";

        for (const inv of approvedInvestors) {
          const { subject, html } = composePqUpdatePromptEmail(inv.full_name, importRoundName);
          await sendEmail(inv.email, subject, html).catch(() => {});
        }

        await auth.client
          .from("investors")
          .update({ pq_update_prompted_at: new Date().toISOString() })
          .in("id", approvedInvestors.map(i => i.id));
      }
    }
  } catch (err: any) {
    console.error("[IMPORT] PQ update prompt failed:", err.message);
  }

  return NextResponse.json(results);
}
