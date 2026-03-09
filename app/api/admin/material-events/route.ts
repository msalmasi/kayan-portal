import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/admin-auth";

/**
 * GET /api/admin/material-events
 * List material events, newest first.
 */
export async function GET() {
  const auth = await getAdminAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await auth.client
    .from("material_events")
    .select("*")
    .order("event_date", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ events: data || [] });
}

/**
 * POST /api/admin/material-events
 * Actions: create, notify, close, delete
 */
export async function POST(request: NextRequest) {
  const auth = await getAdminAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { action } = body;

  if (action === "create") {
    const { title, description, event_date, notes } = body;
    if (!title || !event_date) {
      return NextResponse.json({ error: "title and event_date required" }, { status: 400 });
    }

    // FSA deadline = event_date + 14 days
    const evDate = new Date(event_date);
    const deadline = new Date(evDate);
    deadline.setDate(deadline.getDate() + 14);

    const { data, error } = await auth.client
      .from("material_events")
      .insert({
        title,
        description: description || null,
        event_date,
        fsa_deadline: deadline.toISOString().split("T")[0],
        notes: notes || null,
        created_by: auth.email,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, event: data });
  }

  if (action === "notify") {
    const { event_id } = body;
    if (!event_id) return NextResponse.json({ error: "event_id required" }, { status: 400 });

    const { error } = await auth.client
      .from("material_events")
      .update({
        status: "notified",
        notified_at: new Date().toISOString(),
        notified_by: auth.email,
      })
      .eq("id", event_id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  if (action === "close") {
    const { event_id } = body;
    if (!event_id) return NextResponse.json({ error: "event_id required" }, { status: 400 });

    const { error } = await auth.client
      .from("material_events")
      .update({ status: "closed" })
      .eq("id", event_id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  if (action === "delete") {
    const { event_id } = body;
    if (!event_id) return NextResponse.json({ error: "event_id required" }, { status: 400 });

    const { error } = await auth.client
      .from("material_events")
      .delete()
      .eq("id", event_id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
