"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { toast } from "sonner";
import { useAdminRole } from "@/lib/hooks";

// ============================================================
// Admin Re-issuance Page
//
// Manages SAFT re-issuance workflows. Currently supports entity
// change (novation flow). Designed to be extended with new
// re-issuance types (template corrections, regulatory updates, etc.)
// ============================================================

// ─── Types ──────────────────────────────────────────────────

interface BatchCounts {
  total: number;
  pending_novation: number;
  novation_signed: number;
  pending_new_saft: number;
  complete: number;
  cancelled: number;
}

interface Batch {
  id: string;
  old_entity_name: string;
  new_entity_name: string;
  new_entity_jurisdiction: string | null;
  reason: string;
  status: "active" | "completed" | "cancelled";
  initiated_by: string;
  completed_at: string | null;
  created_at: string;
  counts: BatchCounts;
}

interface BatchItem {
  id: string;
  investor_id: string;
  investor_name: string;
  investor_email: string;
  round_id: string;
  round_name: string;
  status: string;
  old_saft_id: string | null;
  novation_doc_id: string | null;
  new_saft_id: string | null;
}

interface BatchDetail {
  batch_id: string;
  status: string;
  total_items: number;
  pending_novation: number;
  novation_signed: number;
  pending_new_saft: number;
  complete: number;
  cancelled: number;
  items: BatchItem[];
}

interface Round {
  id: string;
  name: string;
}

// ─── Status badge helper ────────────────────────────────────

function ItemStatusBadge({ status }: { status: string }) {
  const map: Record<string, { variant: "green" | "yellow" | "gray" | "red"; label: string }> = {
    pending_novation: { variant: "yellow", label: "Awaiting Novation" },
    novation_signed: { variant: "yellow", label: "Novation Signed" },
    pending_new_saft: { variant: "yellow", label: "Awaiting New SAFT" },
    complete: { variant: "green", label: "Complete" },
    cancelled: { variant: "gray", label: "Cancelled" },
  };
  const { variant, label } = map[status] || { variant: "gray" as const, label: status };
  return <Badge variant={variant}>{label}</Badge>;
}

function BatchStatusBadge({ status }: { status: string }) {
  const map: Record<string, { variant: "green" | "yellow" | "gray" | "red"; label: string }> = {
    active: { variant: "yellow", label: "Active" },
    completed: { variant: "green", label: "Completed" },
    cancelled: { variant: "gray", label: "Cancelled" },
  };
  const { variant, label } = map[status] || { variant: "gray" as const, label: status };
  return <Badge variant={variant}>{label}</Badge>;
}

// ─── Progress bar ───────────────────────────────────────────

function ProgressBar({ counts }: { counts: BatchCounts }) {
  if (counts.total === 0) return null;
  const pct = Math.round((counts.complete / counts.total) * 100);

  return (
    <div className="mt-2">
      <div className="flex justify-between text-xs text-gray-500 mb-1">
        <span>{counts.complete} of {counts.total} complete</span>
        <span>{pct}%</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-emerald-500 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────

export default function ReissuancePage() {
  const { role } = useAdminRole();
  const isAdmin = role === "admin" || role === "super_admin";

  // State
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [expandedBatch, setExpandedBatch] = useState<string | null>(null);
  const [batchDetail, setBatchDetail] = useState<BatchDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [hasNovationTemplate, setHasNovationTemplate] = useState(true);

  // Form state
  const [oldEntity, setOldEntity] = useState("");
  const [newEntity, setNewEntity] = useState("");
  const [newJurisdiction, setNewJurisdiction] = useState("");
  const [reason, setReason] = useState("");
  const [selectedRounds, setSelectedRounds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [confirmStep, setConfirmStep] = useState(false);

  // ── Fetch batches ──
  const fetchBatches = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/reissuance");
      if (res.ok) setBatches(await res.json());
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  // ── Fetch rounds for form ──
  const fetchRounds = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/rounds");
      if (res.ok) setRounds(await res.json());
    } catch { /* silent */ }
  }, []);

  // ── Check for novation template ──
  const checkTemplate = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/documents/templates?doc_type=novation");
      if (res.ok) {
        const templates = await res.json();
        setHasNovationTemplate(templates.length > 0);
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => { fetchBatches(); fetchRounds(); checkTemplate(); }, [fetchBatches, fetchRounds, checkTemplate]);

  // ── Fetch batch detail ──
  const fetchDetail = async (batchId: string) => {
    if (expandedBatch === batchId) {
      setExpandedBatch(null);
      setBatchDetail(null);
      return;
    }

    setExpandedBatch(batchId);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/admin/reissuance/${batchId}`);
      if (res.ok) setBatchDetail(await res.json());
    } catch { /* silent */ }
    setDetailLoading(false);
  };

  // ── Create batch ──
  const handleCreate = async () => {
    if (!oldEntity || !newEntity || !reason) {
      toast.error("Please fill in all required fields");
      return;
    }

    // Require explicit confirmation
    if (!confirmStep) {
      setConfirmStep(true);
      return;
    }

    setCreating(true);
    const res = await fetch("/api/admin/reissuance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        old_entity_name: oldEntity,
        new_entity_name: newEntity,
        new_entity_jurisdiction: newJurisdiction || undefined,
        reason,
        round_ids: selectedRounds.length > 0 ? selectedRounds : undefined,
      }),
    });

    setCreating(false);

    if (res.ok) {
      const data = await res.json();
      toast.success(data.message);
      resetForm();
      fetchBatches();
    } else {
      const err = await res.json();
      toast.error(err.error || "Failed to initiate re-issuance");
    }
  };

  // ── Cancel batch ──
  const handleCancelBatch = async (batchId: string) => {
    if (!confirm("Cancel this re-issuance batch? Already-completed items will not be affected.")) return;

    const res = await fetch(`/api/admin/reissuance/${batchId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel_batch" }),
    });

    if (res.ok) {
      toast.success("Batch cancelled");
      fetchBatches();
      if (expandedBatch === batchId) fetchDetail(batchId);
    } else {
      toast.error("Failed to cancel batch");
    }
  };

  // ── Cancel single item ──
  const handleCancelItem = async (batchId: string, itemId: string) => {
    if (!confirm("Cancel this investor's re-issuance?")) return;

    const res = await fetch(`/api/admin/reissuance/${batchId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel_item", item_id: itemId }),
    });

    if (res.ok) {
      toast.success("Item cancelled");
      fetchDetail(batchId);
      fetchBatches();
    } else {
      toast.error("Failed to cancel item");
    }
  };

  // ── Toggle round selection ──
  const toggleRound = (roundId: string) => {
    setSelectedRounds((prev) =>
      prev.includes(roundId) ? prev.filter((r) => r !== roundId) : [...prev, roundId]
    );
  };

  const resetForm = () => {
    setShowForm(false);
    setConfirmStep(false);
    setOldEntity("");
    setNewEntity("");
    setNewJurisdiction("");
    setReason("");
    setSelectedRounds([]);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Document Re-issuance</h1>
          <p className="text-sm text-gray-500 mt-1">
            Re-issue SAFTs when the issuing entity, terms, or templates change.
            Each batch generates novation agreements for affected investors.
          </p>
        </div>
        {isAdmin && !showForm && (
          <Button onClick={() => setShowForm(true)} size="sm">
            New Re-issuance
          </Button>
        )}
      </div>

      {/* ── New re-issuance form ── */}
      {showForm && (
        <Card>
          <CardHeader
            title="Initiate Re-issuance"
            subtitle="This will supersede existing SAFTs and send novation agreements to all affected investors"
          />

          <div className="space-y-4">
            {/* Re-issuance type — extensible for future reasons */}
            <div className="p-3 rounded-lg bg-blue-50 border border-blue-100">
              <p className="text-xs font-medium text-blue-700 mb-1">Re-issuance Type</p>
              <p className="text-sm text-blue-600">
                Entity Change (Novation) — Terminates old SAFT, issues replacement with new entity
              </p>
              <p className="text-xs text-blue-400 mt-1">
                More re-issuance types coming soon (template updates, regulatory corrections)
              </p>
            </div>

            {/* Missing template warning */}
            {!hasNovationTemplate && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                <p className="text-sm font-medium text-red-700">Novation template required</p>
                <p className="text-xs text-red-600 mt-1">
                  Upload a Novation Agreement template (.docx) in{" "}
                  <a href="/admin/documents" className="underline font-medium">Document Templates</a>{" "}
                  before initiating re-issuance.
                </p>
              </div>
            )}

            {/* Entity fields */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Current Entity Name *
                </label>
                <input
                  type="text"
                  value={oldEntity}
                  onChange={(e) => setOldEntity(e.target.value)}
                  placeholder="e.g., Kayan International Inc."
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:ring-2 focus:ring-kayan-500 focus:border-kayan-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  New Entity Name *
                </label>
                <input
                  type="text"
                  value={newEntity}
                  onChange={(e) => setNewEntity(e.target.value)}
                  placeholder="e.g., Kayan Holdings Ltd."
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:ring-2 focus:ring-kayan-500 focus:border-kayan-500 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                New Entity Jurisdiction
              </label>
              <input
                type="text"
                value={newJurisdiction}
                onChange={(e) => setNewJurisdiction(e.target.value)}
                placeholder="e.g., British Virgin Islands"
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:ring-2 focus:ring-kayan-500 focus:border-kayan-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reason for Re-issuance *
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Describe why SAFTs are being re-issued..."
                rows={2}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:ring-2 focus:ring-kayan-500 focus:border-kayan-500 outline-none resize-none"
              />
            </div>

            {/* Round selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Affected Rounds
              </label>
              <p className="text-xs text-gray-400 mb-2">
                Select specific rounds, or leave all unchecked to apply to every round with signed SAFTs.
              </p>
              <div className="flex flex-wrap gap-2">
                {rounds.map((round) => (
                  <button
                    key={round.id}
                    onClick={() => toggleRound(round.id)}
                    className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                      selectedRounds.includes(round.id)
                        ? "bg-kayan-600 text-white border-kayan-600"
                        : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    {round.name}
                  </button>
                ))}
              </div>
              {selectedRounds.length === 0 && rounds.length > 0 && (
                <p className="text-xs text-amber-600 mt-1">
                  All rounds will be affected
                </p>
              )}
            </div>

            {/* Confirmation step */}
            {confirmStep && (
              <div className="p-4 rounded-lg bg-red-50 border border-red-200">
                <p className="text-sm font-medium text-red-800 mb-2">
                  Please confirm this action
                </p>
                <ul className="text-xs text-red-600 space-y-1 mb-3">
                  <li>• Existing signed SAFTs will be marked as superseded</li>
                  <li>• Novation agreements will be sent to all affected investors</li>
                  <li>• Payments will be frozen for affected rounds until new SAFTs are signed</li>
                  <li>• This action cannot be undone (individual items can be cancelled)</li>
                </ul>
                <p className="text-xs text-red-500">
                  {selectedRounds.length > 0
                    ? `Rounds affected: ${rounds.filter((r) => selectedRounds.includes(r.id)).map((r) => r.name).join(", ")}`
                    : "All rounds with signed SAFTs will be affected"
                  }
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <Button
                onClick={handleCreate}
                loading={creating}
                disabled={!oldEntity || !newEntity || !reason || !hasNovationTemplate}
                size="sm"
                className={confirmStep ? "!bg-red-600 hover:!bg-red-500" : ""}
              >
                {confirmStep ? "Confirm & Send Novations" : "Initiate Re-issuance"}
              </Button>
              <Button variant="ghost" size="sm" onClick={resetForm}>
                Cancel
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* ── Batch list ── */}
      {loading ? (
        <Card>
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-20 bg-gray-50 rounded-lg animate-pulse" />
            ))}
          </div>
        </Card>
      ) : batches.length === 0 ? (
        <Card>
          <div className="text-center py-8">
            <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            <p className="text-sm text-gray-500">No re-issuance batches yet</p>
            <p className="text-xs text-gray-400 mt-1">
              Create one when you need to change the issuing entity or update SAFT documents
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {batches.map((batch) => (
            <Card key={batch.id} className="!p-0 overflow-hidden">
              {/* Batch header — clickable to expand */}
              <button
                onClick={() => fetchDetail(batch.id)}
                className="w-full p-5 text-left hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {batch.old_entity_name} → {batch.new_entity_name}
                      </p>
                      <BatchStatusBadge status={batch.status} />
                    </div>
                    <p className="text-xs text-gray-500 truncate">{batch.reason}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      Initiated by {batch.initiated_by} on {new Date(batch.created_at).toLocaleDateString()}
                    </p>
                    <ProgressBar counts={batch.counts} />
                  </div>

                  {/* Expand chevron */}
                  <svg
                    className={`w-5 h-5 text-gray-400 ml-3 mt-0.5 transition-transform ${expandedBatch === batch.id ? "rotate-180" : ""}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </div>
              </button>

              {/* Expanded detail */}
              {expandedBatch === batch.id && (
                <div className="border-t border-gray-100">
                  {detailLoading ? (
                    <div className="p-5">
                      <div className="h-24 bg-gray-50 rounded-lg animate-pulse" />
                    </div>
                  ) : batchDetail ? (
                    <div className="p-5 pt-4">
                      {/* Summary stats */}
                      <div className="grid grid-cols-5 gap-3 mb-4">
                        {[
                          { label: "Awaiting Novation", count: batchDetail.pending_novation, color: "text-amber-600" },
                          { label: "Novation Signed", count: batchDetail.novation_signed, color: "text-blue-600" },
                          { label: "Awaiting New SAFT", count: batchDetail.pending_new_saft, color: "text-purple-600" },
                          { label: "Complete", count: batchDetail.complete, color: "text-emerald-600" },
                          { label: "Cancelled", count: batchDetail.cancelled, color: "text-gray-400" },
                        ].map((stat) => (
                          <div key={stat.label} className="text-center p-2 rounded-lg bg-gray-50">
                            <p className={`text-lg font-bold ${stat.color}`}>{stat.count}</p>
                            <p className="text-xs text-gray-500">{stat.label}</p>
                          </div>
                        ))}
                      </div>

                      {/* Per-investor table */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                              <th className="pb-2 font-medium">Investor</th>
                              <th className="pb-2 font-medium">Round</th>
                              <th className="pb-2 font-medium">Status</th>
                              <th className="pb-2 font-medium text-right">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {batchDetail.items.map((item) => (
                              <tr key={item.id} className="group">
                                <td className="py-2.5">
                                  <p className="font-medium text-gray-900">{item.investor_name}</p>
                                  <p className="text-xs text-gray-400">{item.investor_email}</p>
                                </td>
                                <td className="py-2.5 text-gray-600">{item.round_name}</td>
                                <td className="py-2.5"><ItemStatusBadge status={item.status} /></td>
                                <td className="py-2.5 text-right">
                                  {item.status !== "complete" && item.status !== "cancelled" && isAdmin && (
                                    <button
                                      onClick={() => handleCancelItem(batch.id, item.id)}
                                      className="text-xs text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                      Cancel
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Batch actions */}
                      {batch.status === "active" && isAdmin && (
                        <div className="mt-4 pt-3 border-t border-gray-100">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCancelBatch(batch.id)}
                            className="!text-red-600 hover:!bg-red-50"
                          >
                            Cancel Entire Batch
                          </Button>
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
