"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { toast } from "sonner";

interface MaterialEvent {
  id: string; title: string; description: string | null;
  event_date: string; fsa_deadline: string; status: string;
  notified_at: string | null; notified_by: string | null;
  notes: string | null; created_by: string | null; created_at: string;
}

const inputCls = "w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500";

const STATUS_COLORS: Record<string, string> = {
  open: "bg-red-100 text-red-700",
  notified: "bg-amber-100 text-amber-700",
  closed: "bg-gray-100 text-gray-500",
};

/** Days remaining until deadline, negative if overdue */
function daysUntil(deadline: string): number {
  return Math.ceil((new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

export function MaterialEventsCard() {
  const [events, setEvents] = useState<MaterialEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [eventDate, setEventDate] = useState(new Date().toISOString().split("T")[0]);
  const [saving, setSaving] = useState(false);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/material-events");
    if (res.ok) { const d = await res.json(); setEvents(d.events || []); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const handleCreate = async () => {
    if (!title || !eventDate) { toast.error("Title and event date required"); return; }
    setSaving(true);
    const res = await fetch("/api/admin/material-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", title, description, event_date: eventDate }),
    });
    setSaving(false);
    if (res.ok) {
      toast.success("Material event logged");
      setShowAdd(false); setTitle(""); setDescription("");
      fetchEvents();
    } else { const e = await res.json(); toast.error(e.error || "Failed"); }
  };

  const handleAction = async (id: string, action: string) => {
    const res = await fetch("/api/admin/material-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, event_id: id }),
    });
    if (res.ok) { toast.success(`Event ${action === "mark_notified" ? "marked as notified" : "closed"}`); fetchEvents(); }
    else { toast.error("Failed"); }
  };

  const openEvents = events.filter((e) => e.status === "open");

  return (
    <Card>
      <CardHeader
        title="Material Events"
        subtitle="Labuan FSA requires notification within 14 days of material changes"
      />

      {/* Open event alerts */}
      {openEvents.map((e) => {
        const days = daysUntil(e.fsa_deadline);
        const urgent = days <= 3;
        return (
          <div key={e.id} className={`mb-3 px-3 py-2.5 rounded-lg border ${urgent ? "border-red-300 bg-red-50" : "border-amber-200 bg-amber-50"}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-sm font-medium ${urgent ? "text-red-800" : "text-amber-800"}`}>{e.title}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Event: {new Date(e.event_date).toLocaleDateString()} · Deadline: {new Date(e.fsa_deadline).toLocaleDateString()}
                  {days > 0 ? ` · ${days} day${days !== 1 ? "s" : ""} remaining` : ` · ${Math.abs(days)} day${Math.abs(days) !== 1 ? "s" : ""} overdue`}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="secondary" onClick={() => handleAction(e.id, "mark_notified")} className="text-xs">
                  Mark Notified
                </Button>
                <Button size="sm" variant="ghost" onClick={() => handleAction(e.id, "close")} className="text-xs text-gray-500">
                  Close
                </Button>
              </div>
            </div>
          </div>
        );
      })}

      {/* Add button / form */}
      {!showAdd ? (
        <Button variant="secondary" size="sm" onClick={() => setShowAdd(true)} className="mb-3">
          Log Material Event
        </Button>
      ) : (
        <div className="mb-3 p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-3">
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Event title" className={inputCls} />
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Description (optional)" className={inputCls} />
          <div className="flex items-center gap-3">
            <div>
              <label className="block text-[10px] text-gray-500 mb-0.5">Event Date</label>
              <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} className={`${inputCls} w-40`} />
            </div>
            <div className="flex items-center gap-1 mt-4">
              <Button size="sm" onClick={handleCreate} loading={saving}>Save</Button>
              <Button size="sm" variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {/* History */}
      {loading ? <p className="text-xs text-gray-400 py-2">Loading…</p> : events.length === 0 ? (
        <p className="text-xs text-gray-400 py-2">No material events logged</p>
      ) : (
        <div className="overflow-x-auto -mx-5 px-5">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 text-gray-500">
                <th className="py-1.5 px-2 text-left font-medium">Event</th>
                <th className="py-1.5 px-2 text-left font-medium">Date</th>
                <th className="py-1.5 px-2 text-left font-medium">Deadline</th>
                <th className="py-1.5 px-2 text-center font-medium">Status</th>
                <th className="py-1.5 px-2 text-left font-medium">Notified</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="border-b border-gray-50">
                  <td className="py-2 px-2 text-gray-900">{e.title}</td>
                  <td className="py-2 px-2 text-gray-500">{new Date(e.event_date).toLocaleDateString()}</td>
                  <td className="py-2 px-2 text-gray-500">{new Date(e.fsa_deadline).toLocaleDateString()}</td>
                  <td className="py-2 px-2 text-center">
                    <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${STATUS_COLORS[e.status] || "bg-gray-100 text-gray-500"}`}>
                      {e.status}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-gray-500">
                    {e.notified_at ? `${new Date(e.notified_at).toLocaleDateString()} by ${e.notified_by}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
