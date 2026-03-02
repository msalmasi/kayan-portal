import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getPauseStatus } from "@/lib/platform-pause";

/**
 * GET /api/platform-status
 * Returns current platform pause state. No auth required —
 * this is public info (investors need to know why actions are blocked).
 */
export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const status = await getPauseStatus(supabase);

  return NextResponse.json({
    paused: status.paused,
    reason: status.reason,
  });
}
