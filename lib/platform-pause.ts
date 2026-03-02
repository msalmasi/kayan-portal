import { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// ============================================================
// Platform Pause — DB-driven global kill switch
//
// Blocks investor-facing actions when paused. Admin prep
// (creating investors, allocations) is still allowed.
// Reissuance-related docs bypass the pause by design.
// ============================================================

export interface PauseStatus {
  paused: boolean;
  reason: string | null;
  paused_at: string | null;
}

/**
 * Check current platform pause state.
 * Returns { paused, reason } — never throws.
 */
export async function getPauseStatus(
  supabase: SupabaseClient
): Promise<PauseStatus> {
  const { data } = await supabase
    .from("platform_settings")
    .select("is_paused, pause_reason, paused_at")
    .eq("id", true)
    .single();

  return {
    paused: data?.is_paused ?? false,
    reason: data?.pause_reason ?? null,
    paused_at: data?.paused_at ?? null,
  };
}

/**
 * Guard for investor-facing API routes.
 * Returns a 503 NextResponse if paused, or null if clear to proceed.
 *
 * Usage:
 *   const blocked = await pauseGuard(supabase);
 *   if (blocked) return blocked;
 */
export async function pauseGuard(
  supabase: SupabaseClient
): Promise<NextResponse | null> {
  const status = await getPauseStatus(supabase);

  if (status.paused) {
    return NextResponse.json(
      {
        error: "Platform is temporarily paused",
        paused: true,
        reason: status.reason || "Scheduled maintenance in progress",
      },
      { status: 503 }
    );
  }

  return null;
}

/**
 * Guard that allows reissuance-related documents through.
 * Use this instead of pauseGuard() on the document signing route.
 *
 * @param supabase - Service role client
 * @param documentId - The document being accessed
 * @returns NextResponse (blocked) or null (proceed)
 */
export async function pauseGuardWithReissuanceBypass(
  supabase: SupabaseClient,
  documentId: string
): Promise<NextResponse | null> {
  const status = await getPauseStatus(supabase);
  if (!status.paused) return null;

  // Check if this document is part of an active reissuance
  const { data: doc } = await supabase
    .from("investor_documents")
    .select("reissuance_item_id")
    .eq("id", documentId)
    .single();

  // Reissuance docs bypass the pause — that's the whole point
  if (doc?.reissuance_item_id) return null;

  return NextResponse.json(
    {
      error: "Platform is temporarily paused",
      paused: true,
      reason: status.reason || "Scheduled maintenance in progress",
    },
    { status: 503 }
  );
}

/**
 * Toggle platform pause. Admin-only.
 */
export async function togglePause(
  supabase: SupabaseClient,
  pause: boolean,
  adminEmail: string,
  reason?: string
): Promise<PauseStatus> {
  const now = new Date().toISOString();

  const update = pause
    ? {
        is_paused: true,
        pause_reason: reason || null,
        paused_at: now,
        paused_by: adminEmail,
      }
    : {
        is_paused: false,
        pause_reason: null,
        resumed_at: now,
        resumed_by: adminEmail,
      };

  await supabase
    .from("platform_settings")
    .update(update)
    .eq("id", true);

  return {
    paused: pause,
    reason: pause ? (reason || null) : null,
    paused_at: pause ? now : null,
  };
}
