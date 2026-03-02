import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/admin-auth";
import { getPauseStatus, togglePause } from "@/lib/platform-pause";

/**
 * GET /api/admin/platform-pause
 * Returns current pause state. Any admin role can view.
 */
export async function GET() {
  const auth = await getAdminAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const status = await getPauseStatus(auth.client);
  return NextResponse.json(status);
}

/**
 * POST /api/admin/platform-pause
 * Toggle platform pause on/off. Requires admin+ role.
 *
 * Body: { paused: boolean, reason?: string }
 */
export async function POST(request: NextRequest) {
  const auth = await getAdminAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Only admin+ can toggle pause (not staff or manager)
  if (!["admin", "super_admin"].includes(auth.role)) {
    return NextResponse.json(
      { error: "Only admins can toggle platform pause" },
      { status: 403 }
    );
  }

  const { paused, reason } = await request.json();
  if (typeof paused !== "boolean") {
    return NextResponse.json(
      { error: "'paused' (boolean) is required" },
      { status: 400 }
    );
  }

  const status = await togglePause(auth.client, paused, auth.email, reason);

  return NextResponse.json({
    success: true,
    ...status,
    message: paused
      ? "Platform paused — investor-facing actions are blocked"
      : "Platform resumed — all operations are active",
  });
}
