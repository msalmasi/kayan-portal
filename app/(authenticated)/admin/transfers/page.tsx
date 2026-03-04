"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { KycBadge, PqBadge } from "@/components/ui/Badge";
import Link from "next/link";
import { toast } from "sonner";

// ── Types ──

interface Transfer {
  id: string;
  from_investor_id: string;
  to_investor_id: string | null;
  allocation_id: string;
  round_id: string;
  token_amount: number;
  price_per_token: number | null;
  total_consideration: number | null;
  transfer_type: string;
  status: string;
  direction: string;
  tx_hash: string | null;
  from_wallet: string | null;
  to_wallet: string | null;
  reason: string | null;
  admin_notes: string | null;
  compliance_checks: any;
  rejection_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  completed_at: string | null;
  created_at: string;
  from_inv: { id: string; full_name: string; email: string } | null;
  to_inv: { id: string; full_name: string; email: string } | null;
  saft_rounds: { id: string; name: string } | null;
}

interface Stats {
  total: number; pending: number; approved: number; completed: number;
  rejected: number; total_tokens_transferred: number;
}

const fmt = (n: number) => n.toLocaleString();
const fmtUsd = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const inputCls = "w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500";

const STATUS_COLORS: Record<string, string> = {
  requested: "bg-blue-100 text-blue-700",
  under_review: "bg-amber-100 text-amber-700",
  approved: "bg-emerald-100 text-emerald-700",
  completed: "bg-emerald-100 text-emerald-800",
  rejected: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-500",
  recorded: "bg-purple-100 text-purple-700",
};

const STATUS_TABS = [
  { value: "", label: "All" },
  { value: "requested", label: "Requested" },
  { value: "under_review", label: "Under Review" },
  { value: "approved", label: "Approved" },
  { value: "completed", label: "Completed" },
  { value: "rejected", label: "Rejected" },
];

// ── Stat Card ──

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <p className="text-[11px] text-gray-500 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-xl font-bold text-gray-900">{value}</p>
    </div>
  );
}

// ── Compliance Check Display ──

function ComplianceChecks({ checks }: { checks: any }) {
  if (!checks || !checks.checked_at) return <p className="text-xs text-gray-400">No compliance checks run yet</p>;

  const Check = ({ label, passed }: { label: string; passed: boolean }) => (
    <div className="flex items-center gap-2 text-xs">
      <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${passed ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
        {passed ? "✓" : "✕"}
      </span>
      <span className="text-gray-700">{label}</span>
    </div>
  );

  return (
    <div className="space-y-3">
      <div>
        <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Holding Period</p>
        <Check label={checks.holding_period?.note || "—"} passed={!!checks.holding_period?.passed} />
      </div>
      <div>
        <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Transferor</p>
        <div className="space-y-1">
          <Check label="KYC verified" passed={!!checks.transferor?.kyc_valid} />
          <Check label="PQ approved" passed={!!checks.transferor?.pq_approved} />
          <Check label="Non-U.S. person" passed={!!checks.transferor?.not_us_person} />
        </div>
      </div>
      {checks.transferee ? (
        <div>
          <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Transferee</p>
          <div className="space-y-1">
            <Check label="KYC verified" passed={!!checks.transferee.kyc_valid} />
            <Check label="PQ approved" passed={!!checks.transferee.pq_approved} />
            <Check label="Non-U.S. person" passed={!!checks.transferee.not_us_person} />
          </div>
        </div>
      ) : (
        <p className="text-xs text-amber-600">Transferee not yet identified or onboarded</p>
      )}
      <div>
        <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Volume</p>
        <p className="text-xs text-gray-600">
          Remaining after: {fmt(checks.volume?.tokens_after_transfer || 0)} tokens ·
          Holder count: {checks.volume?.holder_count_after || "—"} ·
          {(checks.volume?.pct_of_supply || 0).toFixed(4)}% of supply
        </p>
      </div>
      <div className={`text-xs font-semibold px-2 py-1 rounded ${checks.all_passed ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
        {checks.all_passed ? "All checks passed" : "Some checks failed — review before approving"}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// RECORD TRANSFER MODAL
// ═══════════════════════════════════════════════════════════

function RecordTransferModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [investors, setInvestors] = useState<any[]>([]);
  const [allocations, setAllocations] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [toEmail, setToEmail] = useState("");
  const [toName, setToName] = useState("");
  const [allocId, setAllocId] = useState("");
  const [amount, setAmount] = useState("");
  const [price, setPrice] = useState("");
  const [txHash, setTxHash] = useState("");
  const [fromWallet, setFromWallet] = useState("");
  const [toWallet, setToWallet] = useState("");
  const [transferType, setTransferType] = useState("sale");
  const [notes, setNotes] = useState("");

  // Load investor list
  useEffect(() => {
    fetch("/api/admin/investors?limit=5000&page=0")
      .then((r) => r.json())
      .then((d) => setInvestors(d.investors || []));
  }, []);

  // Load allocations when from_investor changes
  useEffect(() => {
    if (!fromId) { setAllocations([]); return; }
    fetch(`/api/admin/investors/${fromId}`)
      .then((r) => r.json())
      .then((inv) => {
        const eligible = (inv.allocations || []).filter(
          (a: any) => a.approval_status === "approved" && ["paid", "grant"].includes(a.payment_status) && Number(a.token_amount) > 0
        );
        setAllocations(eligible);
      });
  }, [fromId]);

  const handleSave = async () => {
    if (!fromId || !allocId || !amount) { toast.error("From, allocation, and amount required"); return; }
    setSaving(true);
    const res = await fetch("/api/admin/transfers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "record",
        from_investor_id: fromId,
        to_investor_id: toId || undefined,
        to_email: !toId && toEmail ? toEmail : undefined,
        to_name: !toId && toName ? toName : undefined,
        allocation_id: allocId,
        token_amount: Number(amount),
        price_per_token: price ? Number(price) : undefined,
        transfer_type: transferType,
        tx_hash: txHash || undefined,
        from_wallet: fromWallet || undefined,
        to_wallet: toWallet || undefined,
        admin_notes: notes || undefined,
      }),
    });
    setSaving(false);
    if (res.ok) { toast.success("Transfer recorded"); onSaved(); onClose(); }
    else { const err = await res.json(); toast.error(err.error || "Failed"); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Record Transfer</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">From Investor</label>
          <select value={fromId} onChange={(e) => { setFromId(e.target.value); setAllocId(""); }} className={inputCls}>
            <option value="">Select investor…</option>
            {investors.map((inv: any) => <option key={inv.id} value={inv.id}>{inv.full_name} ({inv.email})</option>)}
          </select>
        </div>

        {allocations.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Source Allocation</label>
            <select value={allocId} onChange={(e) => setAllocId(e.target.value)} className={inputCls}>
              <option value="">Select allocation…</option>
              {allocations.map((a: any) => (
                <option key={a.id} value={a.id}>
                  {a.saft_rounds?.name || "—"} · {fmt(Number(a.token_amount))} tokens · {a.payment_status}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Token Amount</label>
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Price/Token (optional)</label>
            <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" step="0.01" className={inputCls} />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Transfer Type</label>
          <select value={transferType} onChange={(e) => setTransferType(e.target.value)} className={inputCls}>
            <option value="sale">Sale</option>
            <option value="gift">Gift</option>
            <option value="estate">Estate</option>
            <option value="corporate_restructure">Corporate Restructure</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">To Investor</label>
          <select value={toId} onChange={(e) => setToId(e.target.value)} className={inputCls}>
            <option value="">Select existing or enter new below…</option>
            {investors.map((inv: any) => <option key={inv.id} value={inv.id}>{inv.full_name} ({inv.email})</option>)}
          </select>
          {!toId && (
            <div className="grid grid-cols-2 gap-2 mt-2">
              <input type="email" value={toEmail} onChange={(e) => setToEmail(e.target.value)} placeholder="New transferee email" className={`${inputCls} text-xs`} />
              <input type="text" value={toName} onChange={(e) => setToName(e.target.value)} placeholder="Name" className={`${inputCls} text-xs`} />
            </div>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Tx Hash (optional)</label>
          <input type="text" value={txHash} onChange={(e) => setTxHash(e.target.value)} placeholder="0x..." className={`${inputCls} font-mono text-xs`} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">From Wallet</label>
            <input type="text" value={fromWallet} onChange={(e) => setFromWallet(e.target.value)} placeholder="0x..." className={`${inputCls} font-mono text-xs`} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">To Wallet</label>
            <input type="text" value={toWallet} onChange={(e) => setToWallet(e.target.value)} placeholder="0x..." className={`${inputCls} font-mono text-xs`} />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Admin Notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Internal notes…" className={inputCls} />
        </div>

        <div className="flex items-center gap-2 pt-2">
          <Button onClick={handleSave} loading={saving}>Record & Execute</Button>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════

export default function AdminTransfersPage() {
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState("");
  const [showRecord, setShowRecord] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Inline action fields
  const [rejectReason, setRejectReason] = useState("");
  const [completeTxHash, setCompleteTxHash] = useState("");

  const limit = 25;

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (statusFilter) params.set("status", statusFilter);
    const res = await fetch(`/api/admin/transfers?${params}`);
    if (res.ok) {
      const data = await res.json();
      setTransfers(data.transfers || []);
      setTotal(data.total || 0);
      setStats(data.stats || null);
    }
    setLoading(false);
  }, [page, statusFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { setPage(0); }, [statusFilter]);

  // ── Actions ──

  const doAction = async (action: string, transferId: string, extra?: Record<string, any>) => {
    setActionLoading(transferId);
    const res = await fetch("/api/admin/transfers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, transfer_id: transferId, ...extra }),
    });
    setActionLoading(null);
    if (res.ok) {
      toast.success(`Transfer ${action}d`);
      fetchData();
    } else {
      const err = await res.json();
      toast.error(err.error || `Failed to ${action}`);
    }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Transfers</h1>
          <p className="text-sm text-gray-500 mt-1">Secondary token transfer tracking and consent management</p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/api/admin/export?type=transfers"
            download
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
          >
            ↓ Export CSV
          </a>
          <Button onClick={() => setShowRecord(true)}>Record Transfer</Button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard label="Total" value={String(stats.total)} />
          <StatCard label="Pending" value={String(stats.pending)} />
          <StatCard label="Approved" value={String(stats.approved)} />
          <StatCard label="Completed" value={String(stats.completed)} />
          <StatCard label="Rejected" value={String(stats.rejected)} />
          <StatCard label="Tokens Transferred" value={fmt(stats.total_tokens_transferred)} />
        </div>
      )}

      {/* Transfer list */}
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <div className="inline-flex rounded-lg border border-gray-200 text-xs overflow-hidden">
            {STATUS_TABS.map((t) => (
              <button
                key={t.value}
                onClick={() => setStatusFilter(t.value)}
                className={`px-3 py-1.5 transition-colors ${statusFilter === t.value ? "bg-brand-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-gray-400 ml-auto">{total} transfer{total !== 1 ? "s" : ""}</span>
        </div>

        <div className="overflow-x-auto -mx-5 px-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="py-2 px-2 text-left text-[11px] font-semibold text-gray-500 uppercase">Date</th>
                <th className="py-2 px-2 text-left text-[11px] font-semibold text-gray-500 uppercase">From</th>
                <th className="py-2 px-2 text-left text-[11px] font-semibold text-gray-500 uppercase">To</th>
                <th className="py-2 px-2 text-right text-[11px] font-semibold text-gray-500 uppercase">Tokens</th>
                <th className="py-2 px-2 text-left text-[11px] font-semibold text-gray-500 uppercase">Round</th>
                <th className="py-2 px-2 text-center text-[11px] font-semibold text-gray-500 uppercase">Type</th>
                <th className="py-2 px-2 text-center text-[11px] font-semibold text-gray-500 uppercase">Status</th>
                <th className="py-2 px-2 text-left text-[11px] font-semibold text-gray-500 uppercase">Tx</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="py-12 text-center text-gray-400">Loading…</td></tr>
              ) : transfers.length === 0 ? (
                <tr><td colSpan={8} className="py-12 text-center text-gray-400">No transfers found</td></tr>
              ) : transfers.map((t) => (
                <Fragment key={t.id}>
                  <tr
                    className="border-b border-gray-50 hover:bg-gray-50/50 cursor-pointer"
                    onClick={() => setExpanded(expanded === t.id ? null : t.id)}
                  >
                    <td className="py-2.5 px-2 text-xs text-gray-500">{new Date(t.created_at).toLocaleDateString()}</td>
                    <td className="py-2.5 px-2">
                      {t.from_inv ? (
                        <Link href={`/admin/investors/${t.from_inv.id}`} className="text-xs font-medium text-gray-900 hover:text-brand-700" onClick={(e) => e.stopPropagation()}>
                          {t.from_inv.full_name}
                        </Link>
                      ) : <span className="text-xs text-gray-400">—</span>}
                    </td>
                    <td className="py-2.5 px-2">
                      {t.to_inv ? (
                        <Link href={`/admin/investors/${t.to_inv.id}`} className="text-xs font-medium text-gray-900 hover:text-brand-700" onClick={(e) => e.stopPropagation()}>
                          {t.to_inv.full_name}
                        </Link>
                      ) : <span className="text-xs text-gray-400">Unidentified</span>}
                    </td>
                    <td className="py-2.5 px-2 text-right font-medium text-gray-900">{fmt(Number(t.token_amount))}</td>
                    <td className="py-2.5 px-2 text-xs text-gray-600">{t.saft_rounds?.name || "—"}</td>
                    <td className="py-2.5 px-2 text-center">
                      <span className="text-[10px] text-gray-500 capitalize">{t.transfer_type}</span>
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${STATUS_COLORS[t.status] || "bg-gray-100 text-gray-500"}`}>
                        {t.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-xs font-mono text-gray-400 truncate max-w-[80px]">
                      {t.tx_hash ? t.tx_hash.slice(0, 10) + "…" : "—"}
                    </td>
                  </tr>

                  {/* Expanded detail */}
                  {expanded === t.id && (
                    <tr>
                      <td colSpan={8} className="bg-gray-50/70 px-6 py-4">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                          {/* Left: Details */}
                          <div className="space-y-3">
                            <h4 className="text-xs font-semibold text-gray-700 uppercase">Transfer Details</h4>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div><span className="text-gray-400">Direction:</span> <span className="text-gray-700 capitalize">{t.direction.replace("_", " ")}</span></div>
                              <div><span className="text-gray-400">Type:</span> <span className="text-gray-700 capitalize">{t.transfer_type.replace("_", " ")}</span></div>
                              {t.price_per_token && <div><span className="text-gray-400">Price/Token:</span> <span className="text-gray-700">{fmtUsd(Number(t.price_per_token))}</span></div>}
                              {t.total_consideration && <div><span className="text-gray-400">Consideration:</span> <span className="text-gray-700">{fmtUsd(Number(t.total_consideration))}</span></div>}
                              {t.from_wallet && <div className="col-span-2"><span className="text-gray-400">From wallet:</span> <span className="text-gray-700 font-mono text-[11px]">{t.from_wallet}</span></div>}
                              {t.to_wallet && <div className="col-span-2"><span className="text-gray-400">To wallet:</span> <span className="text-gray-700 font-mono text-[11px]">{t.to_wallet}</span></div>}
                              {t.tx_hash && <div className="col-span-2"><span className="text-gray-400">Tx hash:</span> <span className="text-gray-700 font-mono text-[11px]">{t.tx_hash}</span></div>}
                              {t.reason && <div className="col-span-2"><span className="text-gray-400">Reason:</span> <span className="text-gray-700">{t.reason}</span></div>}
                              {t.admin_notes && <div className="col-span-2"><span className="text-gray-400">Notes:</span> <span className="text-gray-700">{t.admin_notes}</span></div>}
                              {t.rejection_reason && <div className="col-span-2"><span className="text-gray-400">Rejection:</span> <span className="text-red-600">{t.rejection_reason}</span></div>}
                              {t.reviewed_by && <div><span className="text-gray-400">Reviewed by:</span> <span className="text-gray-700">{t.reviewed_by}</span></div>}
                            </div>

                            {/* Actions */}
                            {["requested", "under_review", "approved"].includes(t.status) && (
                              <div className="space-y-2 pt-2 border-t border-gray-200">
                                <h4 className="text-xs font-semibold text-gray-700 uppercase">Actions</h4>
                                <div className="flex flex-wrap items-center gap-2">
                                  {["requested", "under_review"].includes(t.status) && (
                                    <Button size="sm" variant="secondary" onClick={() => doAction("review", t.id)} loading={actionLoading === t.id} className="text-xs">
                                      Run Compliance
                                    </Button>
                                  )}
                                  {["requested", "under_review"].includes(t.status) && (
                                    <Button size="sm" onClick={() => doAction("approve", t.id)} loading={actionLoading === t.id} className="text-xs">
                                      Approve
                                    </Button>
                                  )}
                                  {t.status === "approved" && (
                                    <div className="flex items-center gap-1">
                                      <input type="text" value={completeTxHash} onChange={(e) => setCompleteTxHash(e.target.value)} placeholder="Tx hash" className="px-2 py-1 text-xs border rounded-md font-mono w-40" />
                                      <Button size="sm" onClick={() => { doAction("complete", t.id, { tx_hash: completeTxHash }); setCompleteTxHash(""); }} loading={actionLoading === t.id} className="text-xs">
                                        Complete
                                      </Button>
                                    </div>
                                  )}
                                  {["requested", "under_review"].includes(t.status) && (
                                    <div className="flex items-center gap-1">
                                      <input type="text" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Reason" className="px-2 py-1 text-xs border rounded-md w-40" />
                                      <Button size="sm" variant="ghost" onClick={() => { doAction("reject", t.id, { rejection_reason: rejectReason }); setRejectReason(""); }} className="text-xs text-red-600">
                                        Reject
                                      </Button>
                                    </div>
                                  )}
                                  <Button size="sm" variant="ghost" onClick={() => doAction("cancel", t.id)} className="text-xs text-gray-500">
                                    Cancel
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Right: Compliance */}
                          <div>
                            <h4 className="text-xs font-semibold text-gray-700 uppercase mb-2">Compliance Checks</h4>
                            <ComplianceChecks checks={t.compliance_checks} />
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
            <p className="text-[11px] text-gray-400">Page {page + 1} of {totalPages}</p>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0} className="px-2 py-1 text-xs text-gray-500 disabled:opacity-30">‹ Prev</button>
              <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1} className="px-2 py-1 text-xs text-gray-500 disabled:opacity-30">Next ›</button>
            </div>
          </div>
        )}
      </Card>

      {/* Record Transfer Modal */}
      {showRecord && <RecordTransferModal onClose={() => setShowRecord(false)} onSaved={fetchData} />}
    </div>
  );
}
