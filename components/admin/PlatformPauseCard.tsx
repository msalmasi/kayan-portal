"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { toast } from "sonner";
import { useAdminRole } from "@/lib/hooks";

// ============================================================
// PlatformPauseCard — Global kill switch for investor-facing actions
//
// When paused: KYC, PQ, signing, payments, capital calls all blocked.
// Admin prep (creating investors, allocations) still works.
// Reissuance documents bypass the pause by design.
// ============================================================

interface PauseStatus {
  paused: boolean;
  reason: string | null;
  paused_at: string | null;
}

export function PlatformPauseCard() {
  const [status, setStatus] = useState<PauseStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [reason, setReason] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const { role } = useAdminRole();

  const isAdmin = role === "admin" || role === "super_admin";

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/platform-pause");
      if (res.ok) setStatus(await res.json());
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  // ── Toggle handler ──
  const handleToggle = async () => {
    if (!status) return;
    const newPaused = !status.paused;

    // Pausing requires confirmation
    if (newPaused && !showConfirm) {
      setShowConfirm(true);
      return;
    }

    setToggling(true);
    const res = await fetch("/api/admin/platform-pause", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paused: newPaused,
        reason: newPaused ? reason || "Scheduled maintenance" : undefined,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      setStatus(data);
      setShowConfirm(false);
      setReason("");
      toast.success(data.message);
    } else {
      const err = await res.json();
      toast.error(err.error || "Failed to toggle");
    }
    setToggling(false);
  };

  if (loading) {
    return (
      <Card>
        <CardHeader title="Platform Status" subtitle="Loading..." />
        <div className="h-12 bg-gray-50 rounded-lg animate-pulse" />
      </Card>
    );
  }

  if (!status) return null;

  return (
    <Card>
      <CardHeader
        title="Platform Status"
        subtitle="Global kill switch — blocks all investor-facing actions when paused"
      />

      {/* Current status indicator */}
      <div className="flex items-center justify-between p-4 rounded-lg bg-gray-50 mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${status.paused ? "bg-red-500 animate-pulse" : "bg-emerald-500"}`} />
          <div>
            <p className="text-sm font-medium text-gray-900">
              {status.paused ? "Platform Paused" : "Platform Active"}
            </p>
            {status.paused && status.reason && (
              <p className="text-xs text-gray-500 mt-0.5">
                Reason: {status.reason}
              </p>
            )}
            {status.paused && status.paused_at && (
              <p className="text-xs text-gray-400 mt-0.5">
                Since {new Date(status.paused_at).toLocaleString()}
              </p>
            )}
          </div>
        </div>
        <Badge variant={status.paused ? "red" : "green"}>
          {status.paused ? "Paused" : "Live"}
        </Badge>
      </div>

      {/* What gets blocked/allowed */}
      {status.paused && (
        <div className="grid grid-cols-2 gap-3 mb-4 text-xs">
          <div className="p-3 rounded-lg bg-red-50 border border-red-100">
            <p className="font-medium text-red-700 mb-1">Blocked</p>
            <ul className="text-red-600 space-y-0.5">
              <li>KYC initiation</li>
              <li>PQ submission</li>
              <li>Document signing</li>
              <li>Payment submission</li>
              <li>Capital call emails</li>
              <li>Document generation</li>
            </ul>
          </div>
          <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-100">
            <p className="font-medium text-emerald-700 mb-1">Still Works</p>
            <ul className="text-emerald-600 space-y-0.5">
              <li>Admin dashboard</li>
              <li>Create investors</li>
              <li>Manage allocations</li>
              <li>Reissuance signing</li>
              <li>View all data</li>
              <li>Admin settings</li>
            </ul>
          </div>
        </div>
      )}

      {/* Confirmation step for pausing */}
      {showConfirm && !status.paused && (
        <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 mb-4">
          <p className="text-sm font-medium text-amber-800 mb-2">
            Are you sure? This will block all investor-facing actions.
          </p>
          <label className="block text-xs font-medium text-amber-700 mb-1">
            Reason (shown to investors)
          </label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g., Platform undergoing scheduled compliance updates"
            className="w-full px-3 py-2 text-sm rounded-lg border border-amber-300 bg-white focus:ring-2 focus:ring-amber-400 focus:border-amber-400 outline-none"
          />
          <div className="flex gap-2 mt-3">
            <Button
              variant="primary"
              size="sm"
              loading={toggling}
              onClick={handleToggle}
              className="!bg-red-600 hover:!bg-red-500"
            >
              Confirm Pause
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setShowConfirm(false); setReason(""); }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Toggle button */}
      {isAdmin && !showConfirm && (
        <Button
          variant={status.paused ? "primary" : "secondary"}
          size="sm"
          loading={toggling}
          onClick={handleToggle}
          className={status.paused ? "" : "!border-red-300 !text-red-700 hover:!bg-red-50"}
        >
          {status.paused ? "Resume Platform" : "Pause Platform"}
        </Button>
      )}

      {!isAdmin && (
        <p className="text-xs text-gray-400">Only admins can toggle platform pause.</p>
      )}
    </Card>
  );
}
