"use client";

import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

/**
 * RegistryAuditLog
 *
 * Displays the immutable registry audit trail for transfer agent
 * compliance. Shows every ownership-affecting change: allocations,
 * payments, document signings, claim decisions.
 *
 * Props:
 *   investorId? — filter to a specific investor (for investor detail page)
 *   roundId?    — filter to a specific round
 *   compact?    — show fewer columns for embedding in other pages
 */

// Friendly labels for action types
const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  allocation_created:      { label: "Allocation Created",    color: "bg-blue-100 text-blue-700" },
  allocation_updated:      { label: "Allocation Updated",    color: "bg-blue-100 text-blue-700" },
  allocation_deleted:      { label: "Allocation Deleted",    color: "bg-red-100 text-red-700" },
  payment_applied:         { label: "Payment Applied",       color: "bg-emerald-100 text-emerald-700" },
  payment_reversed:        { label: "Payment Reversed",      color: "bg-red-100 text-red-700" },
  payment_claim_approved:  { label: "Claim Approved",        color: "bg-emerald-100 text-emerald-700" },
  payment_claim_rejected:  { label: "Claim Rejected",        color: "bg-amber-100 text-amber-700" },
  payment_claim_deleted:   { label: "Claim Deleted",         color: "bg-red-100 text-red-700" },
  document_signed:         { label: "Document Signed",       color: "bg-purple-100 text-purple-700" },
  document_generated:      { label: "Document Generated",    color: "bg-gray-100 text-gray-700" },
  status_changed:          { label: "Status Changed",        color: "bg-amber-100 text-amber-700" },
  grant_marked:            { label: "Grant Marked",          color: "bg-teal-100 text-teal-700" },
  investor_kyc_changed:    { label: "KYC Changed",           color: "bg-gray-100 text-gray-700" },
  investor_pq_changed:     { label: "PQ Changed",            color: "bg-gray-100 text-gray-700" },
  round_created:           { label: "Round Created",         color: "bg-blue-100 text-blue-700" },
  round_updated:           { label: "Round Updated",         color: "bg-blue-100 text-blue-700" },
};

interface AuditEntry {
  id: string;
  created_at: string;
  action: string;
  entity_type: string;
  entity_id: string;
  investor_id: string | null;
  round_id: string | null;
  changed_by: string;
  old_values: Record<string, any>;
  new_values: Record<string, any>;
  metadata: Record<string, any>;
  ip_address: string | null;
}

interface Props {
  investorId?: string;
  roundId?: string;
  compact?: boolean;
}

export default function RegistryAuditLog({ investorId, roundId, compact }: Props) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const limit = compact ? 10 : 25;

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (investorId) params.set("investor_id", investorId);
    if (roundId) params.set("round_id", roundId);

    const res = await fetch(`/api/admin/registry-audit?${params}`);
    if (res.ok) {
      const json = await res.json();
      setEntries(json.data);
      setTotal(json.total);
    }
    setLoading(false);
  }, [investorId, roundId, offset, limit]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleString("en-US", {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Registry Audit Log</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Immutable record of ownership-affecting changes · {total} entries
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={fetchData} className="text-xs">
          Refresh
        </Button>
      </div>

      {loading && entries.length === 0 ? (
        <p className="text-xs text-gray-400 py-4 text-center">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="text-xs text-gray-400 py-4 text-center">No audit entries yet.</p>
      ) : (
        <div className="space-y-1">
          {entries.map((entry) => {
            const actionInfo = ACTION_LABELS[entry.action] || {
              label: entry.action.replace(/_/g, " "),
              color: "bg-gray-100 text-gray-600",
            };
            const isExpanded = expanded === entry.id;

            return (
              <div
                key={entry.id}
                className="border border-gray-100 rounded-lg px-3 py-2 hover:bg-gray-50 cursor-pointer transition-colors"
                onClick={() => setExpanded(isExpanded ? null : entry.id)}
              >
                <div className="flex items-center gap-3">
                  {/* Action badge */}
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${actionInfo.color}`}>
                    {actionInfo.label}
                  </span>

                  {/* Changed by */}
                  <span className="text-xs text-gray-600 truncate max-w-[180px]">
                    {entry.changed_by}
                  </span>

                  {/* Timestamp */}
                  <span className="text-[10px] text-gray-400 ml-auto whitespace-nowrap">
                    {formatTime(entry.created_at)}
                  </span>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="mt-2 pt-2 border-t border-gray-100 space-y-1">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      <div>
                        <span className="text-gray-400">Entity:</span>{" "}
                        <span className="text-gray-700">{entry.entity_type}</span>
                      </div>
                      <div>
                        <span className="text-gray-400">ID:</span>{" "}
                        <span className="font-mono text-gray-500 text-[10px]">{entry.entity_id.slice(0, 8)}…</span>
                      </div>
                      {entry.ip_address && (
                        <div>
                          <span className="text-gray-400">IP:</span>{" "}
                          <span className="font-mono text-gray-500">{entry.ip_address}</span>
                        </div>
                      )}
                    </div>

                    {/* New values */}
                    {Object.keys(entry.new_values).length > 0 && (
                      <div className="mt-1">
                        <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">Changes</p>
                        <pre className="text-[10px] text-gray-600 bg-gray-50 rounded p-2 overflow-x-auto max-h-32">
                          {JSON.stringify(entry.new_values, null, 2)}
                        </pre>
                      </div>
                    )}

                    {/* Metadata */}
                    {Object.keys(entry.metadata).length > 0 && (
                      <div className="mt-1">
                        <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">Metadata</p>
                        <pre className="text-[10px] text-gray-600 bg-gray-50 rounded p-2 overflow-x-auto max-h-32">
                          {JSON.stringify(entry.metadata, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {total > limit && (
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
          <Button
            variant="ghost"
            size="sm"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - limit))}
            className="text-xs"
          >
            ← Prev
          </Button>
          <span className="text-[10px] text-gray-400">
            {offset + 1}–{Math.min(offset + limit, total)} of {total}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={offset + limit >= total}
            onClick={() => setOffset(offset + limit)}
            className="text-xs"
          >
            Next →
          </Button>
        </div>
      )}
    </Card>
  );
}
