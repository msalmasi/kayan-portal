"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

/**
 * Manual reminder trigger card for admin Operations tab.
 *
 * Runs the same logic as the daily cron — finds investors with
 * approaching round closings or unpaid capital calls and sends
 * reminder emails on the 7/3/1 day thresholds.
 */
export function ReminderCard() {
  const [running, setRunning] = useState(false);
  const [lastResult, setLastResult] = useState<{
    round_closing_sent: number;
    payment_sent: number;
    skipped_already_sent: number;
    errors: string[];
  } | null>(null);

  const handleRun = async () => {
    setRunning(true);
    try {
      const res = await fetch("/api/admin/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "process_all" }),
      });
      const data = await res.json();

      if (res.ok) {
        setLastResult(data);
        const total = data.round_closing_sent + data.payment_sent;
        if (total > 0) {
          toast.success(data.message);
        } else {
          toast.info("No reminders due right now");
        }
      } else {
        toast.error(data.error || "Failed to process reminders");
      }
    } catch {
      toast.error("Network error");
    }
    setRunning(false);
  };

  return (
    <Card>
      <CardHeader
        title="Deadline Reminders"
        subtitle="Automatic emails sent at 7, 3, and 1 day(s) before deadlines"
      />

      <div className="space-y-4">
        {/* Schedule info */}
        <div className="text-sm text-gray-600 space-y-1">
          <p>
            <span className="font-medium text-gray-900">Round closing</span> — investors
            with pending actions (unsigned docs, incomplete KYC/PQ) get reminders
            as the round closing date approaches.
          </p>
          <p>
            <span className="font-medium text-gray-900">Payment deadlines</span> — investors
            with unpaid or partially-paid capital calls get reminders before the
            payment deadline expires.
          </p>
          <p className="text-xs text-gray-400 pt-1">
            Runs automatically every day at 8:00 AM UTC. Each investor receives
            at most one email per threshold (7d, 3d, 1d) — duplicates are suppressed.
          </p>
        </div>

        {/* Manual trigger */}
        <div className="flex items-center gap-3">
          <Button size="sm" onClick={handleRun} loading={running}>
            Run Now
          </Button>
          {lastResult && (
            <p className="text-xs text-gray-500">
              {lastResult.round_closing_sent + lastResult.payment_sent} sent
              {lastResult.skipped_already_sent > 0 && `, ${lastResult.skipped_already_sent} skipped`}
              {lastResult.errors.length > 0 && `, ${lastResult.errors.length} failed`}
            </p>
          )}
        </div>

        {/* Error details */}
        {lastResult && lastResult.errors.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-xs font-medium text-red-700 mb-1">Errors:</p>
            {lastResult.errors.map((err, i) => (
              <p key={i} className="text-xs text-red-600">{err}</p>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
