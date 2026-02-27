"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

/**
 * Alert subscription settings — lets admins choose which
 * notification events trigger an email to their inbox.
 */

// Event types with human-readable labels and descriptions
const EVENT_OPTIONS = [
  {
    type: "kyc_verified",
    label: "KYC Verified",
    desc: "When an investor passes identity verification",
  },
  {
    type: "kyc_rejected",
    label: "KYC Rejected",
    desc: "When an investor fails identity verification",
  },
  {
    type: "pq_submitted",
    label: "PQ Submitted",
    desc: "When an investor submits their Purchaser Questionnaire",
  },
  {
    type: "saft_signed",
    label: "SAFT Signed",
    desc: "When an investor signs their SAFT agreement",
  },
  {
    type: "payment_received",
    label: "Payment Received",
    desc: "When a payment status is updated to paid or partial",
  },
  {
    type: "allocation_proposed",
    label: "Allocation Proposed",
    desc: "When staff proposes a new allocation (needs approval)",
  },
  {
    type: "allocation_approved",
    label: "Allocation Approved",
    desc: "When a pending allocation is approved by a manager",
  },
  {
    type: "allocation_rejected",
    label: "Allocation Rejected",
    desc: "When a pending allocation is rejected by a manager",
  },
];

export function AlertSettings() {
  const [subscribed, setSubscribed] = useState<string[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Fetch current preferences
  useEffect(() => {
    fetch("/api/admin/alerts")
      .then((r) => r.json())
      .then((data) => {
        if (data.subscription) {
          setSubscribed(data.subscription.event_types || []);
          setEnabled(data.subscription.enabled !== false);
        }
      })
      .catch(() => toast.error("Failed to load alert preferences"))
      .finally(() => setLoading(false));
  }, []);

  // Toggle a single event type
  const toggleEvent = (eventType: string) => {
    setSubscribed((prev) =>
      prev.includes(eventType)
        ? prev.filter((t) => t !== eventType)
        : [...prev, eventType]
    );
  };

  // Select / deselect all
  const selectAll = () => setSubscribed(EVENT_OPTIONS.map((e) => e.type));
  const selectNone = () => setSubscribed([]);

  // Save
  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/alerts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_types: subscribed, enabled }),
      });
      if (!res.ok) throw new Error("Save failed");
      toast.success("Alert preferences saved");
    } catch {
      toast.error("Failed to save preferences");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader title="Email Alerts" subtitle="Loading..." />
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 bg-gray-100 rounded" />
          ))}
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Email Alerts"
        subtitle="Choose which portal events send you an email notification"
      />

      {/* Master toggle */}
      <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-100">
        <div>
          <p className="text-sm font-medium text-gray-900">
            Email alerts enabled
          </p>
          <p className="text-xs text-gray-500">
            Master switch — turn off to pause all email alerts
          </p>
        </div>
        <button
          onClick={() => setEnabled(!enabled)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            enabled ? "bg-kayan-600" : "bg-gray-200"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              enabled ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>

      {/* Quick select */}
      <div className="flex gap-2 mb-3">
        <button
          onClick={selectAll}
          className="text-xs text-kayan-600 hover:underline"
        >
          Select all
        </button>
        <span className="text-xs text-gray-300">|</span>
        <button
          onClick={selectNone}
          className="text-xs text-gray-500 hover:underline"
        >
          Clear all
        </button>
      </div>

      {/* Event checkboxes */}
      <div className={`space-y-2 ${!enabled ? "opacity-50 pointer-events-none" : ""}`}>
        {EVENT_OPTIONS.map((evt) => (
          <label
            key={evt.type}
            className="flex items-start gap-3 p-3 rounded-lg border border-gray-100 hover:border-gray-200 cursor-pointer transition-colors"
          >
            <input
              type="checkbox"
              checked={subscribed.includes(evt.type)}
              onChange={() => toggleEvent(evt.type)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-kayan-600 focus:ring-kayan-500"
            />
            <div>
              <p className="text-sm font-medium text-gray-900">{evt.label}</p>
              <p className="text-xs text-gray-500">{evt.desc}</p>
            </div>
          </label>
        ))}
      </div>

      {/* Save */}
      <div className="mt-4 pt-4 border-t border-gray-100 flex justify-end">
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving..." : "Save Preferences"}
        </Button>
      </div>
    </Card>
  );
}
