"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { toast } from "sonner";

const inputCls = "w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500";

export function RecertificationCard() {
  const [stats, setStats] = useState<{
    total_approved: number; expiring_soon: number; expired: number;
    last_recert_date: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [customMessage, setCustomMessage] = useState("");

  useEffect(() => {
    // Fetch cert age stats from investors API
    fetch("/api/admin/investors?limit=5000&page=0")
      .then((r) => r.json())
      .then((data) => {
        const investors = (data.investors || []) as any[];
        const approved = investors.filter((i: any) => i.pq_status === "approved");
        const now = Date.now();
        const dayMs = 1000 * 60 * 60 * 24;

        // Check pq_reviewed_at age
        let expiringSoon = 0;
        let expired = 0;
        let lastRecert: string | null = null;

        for (const inv of approved) {
          const certDate = inv.pq_last_certified_at || inv.pq_reviewed_at;
          if (!certDate) { expired++; continue; }
          const age = (now - new Date(certDate).getTime()) / dayMs;
          if (age >= 365) expired++;
          else if (age >= 300) expiringSoon++;
          if (!lastRecert || certDate > lastRecert) lastRecert = certDate;
        }

        setStats({
          total_approved: approved.length,
          expiring_soon: expiringSoon,
          expired,
          last_recert_date: lastRecert,
        });
      })
      .finally(() => setLoading(false));
  }, []);

  const handleTrigger = async () => {
    setTriggering(true);
    const res = await fetch("/api/admin/pq-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "force_resubmit",
        message: customMessage || "Annual re-certification: Please review and resubmit your Purchaser Questionnaire to re-confirm your accredited/sophisticated investor status.",
      }),
    });
    setTriggering(false);
    setShowConfirm(false);
    setCustomMessage("");

    if (res.ok) {
      const data = await res.json();
      toast.success(data.message || "Re-certification triggered");
    } else {
      toast.error("Failed to trigger re-certification");
    }
  };

  if (loading) return <Card><p className="text-xs text-gray-400 py-4 text-center">Loading…</p></Card>;

  return (
    <Card>
      <CardHeader
        title="Annual Re-Certification"
        subtitle="Prompt all approved investors to re-confirm accredited/sophisticated status"
      />

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <p className="text-[10px] text-gray-500 uppercase">Approved PQs</p>
            <p className="text-sm font-bold text-gray-900">{stats.total_approved}</p>
          </div>
          <div className={`rounded-lg p-3 text-center ${stats.expiring_soon > 0 ? "bg-amber-50" : "bg-gray-50"}`}>
            <p className="text-[10px] text-gray-500 uppercase">Expiring (300+ days)</p>
            <p className={`text-sm font-bold ${stats.expiring_soon > 0 ? "text-amber-700" : "text-gray-900"}`}>{stats.expiring_soon}</p>
          </div>
          <div className={`rounded-lg p-3 text-center ${stats.expired > 0 ? "bg-red-50" : "bg-gray-50"}`}>
            <p className="text-[10px] text-gray-500 uppercase">Expired (365+ days)</p>
            <p className={`text-sm font-bold ${stats.expired > 0 ? "text-red-700" : "text-gray-900"}`}>{stats.expired}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <p className="text-[10px] text-gray-500 uppercase">Last Re-Cert</p>
            <p className="text-sm font-bold text-gray-900">
              {stats.last_recert_date ? new Date(stats.last_recert_date).toLocaleDateString() : "Never"}
            </p>
          </div>
        </div>
      )}

      {/* Trigger */}
      {!showConfirm ? (
        <Button variant="secondary" size="sm" onClick={() => setShowConfirm(true)}>
          Trigger Annual Re-Certification
        </Button>
      ) : (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
          <p className="text-sm font-medium text-amber-800">
            This will reset all approved PQs to "Sent" and email every approved investor requesting they resubmit.
          </p>
          <textarea
            value={customMessage}
            onChange={(e) => setCustomMessage(e.target.value)}
            rows={2}
            placeholder="Custom message (optional) — defaults to annual re-certification language"
            className={`${inputCls} text-xs`}
          />
          <div className="flex items-center gap-2">
            <Button onClick={handleTrigger} loading={triggering} className="text-xs">
              Confirm & Send
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setShowConfirm(false); setCustomMessage(""); }}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <p className="text-xs text-gray-400 mt-3">
        Re-certification uses the existing PQ resubmission flow. Investors receive an email and see a banner on their dashboard prompting them to review and resubmit their questionnaire.
      </p>
    </Card>
  );
}
