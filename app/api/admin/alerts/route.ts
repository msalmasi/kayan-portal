import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/admin-auth";

/**
 * All subscribable event types.
 * Used for validation and to display the full list on the settings UI.
 */
const ALERT_EVENT_TYPES = [
  "kyc_verified",
  "kyc_rejected",
  "pq_submitted",
  "saft_signed",
  "payment_received",
  "allocation_proposed",
  "allocation_approved",
  "allocation_rejected",
] as const;

/**
 * GET /api/admin/alerts
 * Returns the current admin's alert subscription preferences.
 */
export async function GET() {
  const auth = await getAdminAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Look up existing subscription
  const { data: admin } = await auth.client
    .from("admin_users")
    .select("id")
    .ilike("email", auth.email)
    .single();

  if (!admin) {
    return NextResponse.json({ error: "Admin not found" }, { status: 404 });
  }

  const { data: sub } = await auth.client
    .from("admin_alert_subscriptions")
    .select("*")
    .eq("admin_id", admin.id)
    .maybeSingle();

  return NextResponse.json({
    subscription: sub || null,
    available_events: ALERT_EVENT_TYPES,
  });
}

/**
 * PUT /api/admin/alerts
 * Create or update the admin's alert subscription.
 *
 * Body: {
 *   event_types: string[],   — which events to receive emails for
 *   enabled?: boolean         — master toggle (default true)
 * }
 */
export async function PUT(request: NextRequest) {
  const auth = await getAdminAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const eventTypes: string[] = body.event_types || [];
  const enabled = body.enabled !== false;

  // Validate event types
  const valid = eventTypes.filter((t: string) =>
    (ALERT_EVENT_TYPES as readonly string[]).includes(t)
  );

  // Get admin record
  const { data: admin } = await auth.client
    .from("admin_users")
    .select("id")
    .ilike("email", auth.email)
    .single();

  if (!admin) {
    return NextResponse.json({ error: "Admin not found" }, { status: 404 });
  }

  // Upsert: create if missing, update if exists
  const { data: existing } = await auth.client
    .from("admin_alert_subscriptions")
    .select("id")
    .eq("admin_id", admin.id)
    .maybeSingle();

  if (existing) {
    const { data, error } = await auth.client
      .from("admin_alert_subscriptions")
      .update({
        event_types: valid,
        enabled,
        email: auth.email,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(data);
  }

  // Create new
  const { data, error } = await auth.client
    .from("admin_alert_subscriptions")
    .insert({
      admin_id: admin.id,
      email: auth.email,
      event_types: valid,
      enabled,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data);
}
