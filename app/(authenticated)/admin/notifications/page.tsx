"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

// ─── Types ──────────────────────────────────────────────────

interface Notification {
  id: string;
  event_type: string;
  priority: "action_required" | "info";
  investor_id: string;
  investor_name: string;
  investor_email: string;
  title: string;
  detail: string | null;
  is_read: boolean;
  read_by: string | null;
  read_at: string | null;
  metadata: Record<string, any>;
  created_at: string;
}

// ─── Event type display config ──────────────────────────────

const EVENT_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  kyc_verified:         { icon: "✓", color: "text-emerald-600 bg-emerald-50", label: "KYC Verified" },
  kyc_rejected:         { icon: "✗", color: "text-red-600 bg-red-50", label: "KYC Rejected" },
  pq_submitted:         { icon: "📋", color: "text-amber-600 bg-amber-50", label: "PQ Submitted" },
  saft_signed:          { icon: "✍", color: "text-blue-600 bg-blue-50", label: "SAFT Signed" },
  payment_received:     { icon: "$", color: "text-emerald-600 bg-emerald-50", label: "Payment" },
  docs_generated:       { icon: "📄", color: "text-gray-600 bg-gray-50", label: "Docs Generated" },
  allocation_proposed:  { icon: "➕", color: "text-amber-600 bg-amber-50", label: "Allocation Proposed" },
  allocation_approved:  { icon: "✓", color: "text-emerald-600 bg-emerald-50", label: "Allocation Approved" },
  allocation_rejected:  { icon: "✗", color: "text-red-600 bg-red-50", label: "Allocation Rejected" },
};

// ─── Relative time helper ───────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

// ─── Main Page ──────────────────────────────────────────────

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "unread" | "action">("all");

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "50" });
    if (filter === "unread") params.set("unread_only", "true");

    const res = await fetch(`/api/admin/notifications?${params}`);
    if (res.ok) {
      const data = await res.json();
      let items = data.notifications || [];
      if (filter === "action") {
        items = items.filter((n: Notification) => n.priority === "action_required" && !n.is_read);
      }
      setNotifications(items);
      setTotal(data.total || 0);
    }
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Mark single notification as read
  const markRead = async (id: string) => {
    await fetch("/api/admin/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [id] }),
    });
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
  };

  // Mark all as read
  const markAllRead = async () => {
    await fetch("/api/admin/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mark_all_read: true }),
    });
    toast.success("All notifications marked as read");
    fetchNotifications();
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;
  const actionCount = notifications.filter((n) => n.priority === "action_required" && !n.is_read).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
          <p className="text-sm text-gray-500 mt-1">
            {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
            {actionCount > 0 && ` · ${actionCount} need${actionCount === 1 ? "s" : ""} action`}
          </p>
        </div>
        {unreadCount > 0 && (
          <Button variant="ghost" size="sm" onClick={markAllRead}>
            Mark all read
          </Button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {([
          ["all", "All"],
          ["action", "Action Required"],
          ["unread", "Unread"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              filter === key
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {label}
            {key === "action" && actionCount > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">
                {actionCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Notification list */}
      {loading ? (
        <p className="text-gray-400 text-center py-12">Loading...</p>
      ) : notifications.length === 0 ? (
        <Card>
          <div className="text-center py-12 text-gray-400">
            <p className="text-lg font-medium">No notifications</p>
            <p className="text-sm mt-1">
              {filter === "action"
                ? "No items require your attention right now."
                : filter === "unread"
                  ? "All caught up!"
                  : "Notifications will appear as investors progress through the workflow."}
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => {
            const cfg = EVENT_CONFIG[n.event_type] || {
              icon: "•",
              color: "text-gray-600 bg-gray-50",
              label: n.event_type,
            };

            return (
              <div
                key={n.id}
                className={`flex items-start gap-4 p-4 rounded-lg border transition-colors ${
                  n.is_read
                    ? "bg-white border-gray-100"
                    : n.priority === "action_required"
                      ? "bg-amber-50/50 border-amber-200"
                      : "bg-blue-50/30 border-blue-100"
                }`}
              >
                {/* Event icon */}
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${cfg.color}`}>
                  {cfg.icon}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className={`text-sm ${n.is_read ? "text-gray-700" : "text-gray-900 font-medium"}`}>
                        {n.title}
                      </p>
                      {n.detail && (
                        <p className="text-xs text-gray-500 mt-0.5">{n.detail}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-gray-400">{timeAgo(n.created_at)}</span>
                      {!n.is_read && (
                        <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-3 mt-2">
                    <Link
                      href={`/admin/investors/${n.investor_id}`}
                      className="text-xs font-medium text-kayan-600 hover:text-kayan-800"
                      onClick={() => !n.is_read && markRead(n.id)}
                    >
                      View Investor →
                    </Link>
                    {n.priority === "action_required" && !n.is_read && (
                      <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded">
                        Action Required
                      </span>
                    )}
                    {!n.is_read && (
                      <button
                        onClick={() => markRead(n.id)}
                        className="text-xs text-gray-400 hover:text-gray-600"
                      >
                        Mark read
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
