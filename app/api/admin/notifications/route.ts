import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/admin-auth";

/**
 * GET /api/admin/notifications
 * Returns notifications for the admin feed.
 *
 * Query params:
 *   ?unread_only=true       — only unread notifications
 *   ?action_required=true   — unresolved action_required items (ignores read status)
 *   ?limit=30               — page size
 *   ?offset=0               — pagination offset
 *   ?count_only=true        — return just the unread count (for sidebar badge)
 */
export async function GET(request: NextRequest) {
  const auth = await getAdminAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const countOnly = searchParams.get("count_only") === "true";
  const unreadOnly = searchParams.get("unread_only") === "true";
  const actionRequired = searchParams.get("action_required") === "true";
  const limit = parseInt(searchParams.get("limit") || "50");
  const offset = parseInt(searchParams.get("offset") || "0");

  // Quick count for sidebar badge
  if (countOnly) {
    const { count } = await auth.client
      .from("admin_notifications")
      .select("id", { count: "exact", head: true })
      .eq("is_read", false);

    return NextResponse.json({ unread_count: count || 0 });
  }

  // Build query
  let query = auth.client
    .from("admin_notifications")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (actionRequired) {
    // Show all unresolved action items regardless of read status
    query = query.eq("priority", "action_required").eq("is_resolved", false);
  } else if (unreadOnly) {
    query = query.eq("is_read", false);
  }

  const { data, count, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ notifications: data || [], total: count || 0 });
}

/**
 * PATCH /api/admin/notifications
 * Mark notifications as read.
 *
 * Body:
 *   { ids: string[] }           — mark specific ones
 *   { mark_all_read: true }     — mark all unread as read
 */
export async function PATCH(request: NextRequest) {
  const auth = await getAdminAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const now = new Date().toISOString();

  if (body.mark_all_read) {
    await auth.client
      .from("admin_notifications")
      .update({ is_read: true, read_by: auth.email, read_at: now })
      .eq("is_read", false);

    return NextResponse.json({ success: true, action: "marked_all_read" });
  }

  if (body.ids && Array.isArray(body.ids) && body.ids.length > 0) {
    await auth.client
      .from("admin_notifications")
      .update({ is_read: true, read_by: auth.email, read_at: now })
      .in("id", body.ids);

    return NextResponse.json({ success: true, marked: body.ids.length });
  }

  return NextResponse.json({ error: "Provide ids[] or mark_all_read" }, { status: 400 });
}
