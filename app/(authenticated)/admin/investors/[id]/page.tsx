"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { KycBadge, PaymentBadge, PqBadge } from "@/components/ui/Badge";
import { useAdminRole } from "@/lib/hooks";
import { formatTokenAmount } from "@/lib/vesting";
import {
  InvestorWithAllocations,
  SaftRound,
  EmailEvent,
  PaymentStatus,
  PaymentMethod,
  PqStatus,
  PAYMENT_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  PQ_STATUS_LABELS,
} from "@/lib/types";

// ── Extended investor type with email events ──
interface InvestorFull extends InvestorWithAllocations {
  email_events: EmailEvent[];
}

export default function InvestorDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { canWrite } = useAdminRole();
  const investorId = params.id as string;

  const [investor, setInvestor] = useState<InvestorFull | null>(null);
  const [rounds, setRounds] = useState<SaftRound[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Editable investor fields
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [kycStatus, setKycStatus] = useState("unverified");

  // PQ review fields
  const [pqStatus, setPqStatus] = useState<PqStatus>("not_sent");
  const [pqNotes, setPqNotes] = useState("");

  // New allocation form
  const [newRoundId, setNewRoundId] = useState("");
  const [newTokenAmount, setNewTokenAmount] = useState("");

  // Payment edit state — tracks which allocation is being edited
  const [editingPayment, setEditingPayment] = useState<string | null>(null);
  const [paymentForm, setPaymentForm] = useState<{
    payment_status: PaymentStatus;
    payment_method: PaymentMethod | "";
    amount_received_usd: string;
    tx_reference: string;
  }>({ payment_status: "unpaid", payment_method: "", amount_received_usd: "", tx_reference: "" });

  // ── Fetch all data ──
  const fetchData = useCallback(async () => {
    setLoading(true);
    const [invRes, roundsRes] = await Promise.all([
      fetch(`/api/admin/investors/${investorId}`),
      fetch("/api/admin/rounds"),
    ]);
    if (invRes.ok) {
      const inv = await invRes.json();
      setInvestor(inv);
      setFullName(inv.full_name);
      setEmail(inv.email);
      setKycStatus(inv.kyc_status);
      setPqStatus(inv.pq_status || "not_sent");
      setPqNotes(inv.pq_notes || "");
    }
    if (roundsRes.ok) setRounds(await roundsRes.json());
    setLoading(false);
  }, [investorId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Save investor changes (including PQ) ──
  const handleSave = async () => {
    setSaving(true);
    const res = await fetch(`/api/admin/investors/${investorId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        full_name: fullName,
        email,
        kyc_status: kycStatus,
        pq_status: pqStatus,
        pq_notes: pqNotes,
        pq_reviewed_by: pqStatus === "approved" || pqStatus === "rejected" ? "admin" : undefined,
      }),
    });
    setSaving(false);
    if (res.ok) {
      const result = await res.json();
      if (result.capital_call_sent) {
        toast.success("Investor updated — capital call email sent automatically");
      } else {
        toast.success("Investor updated");
      }
      fetchData();
    } else {
      const err = await res.json();
      toast.error(err.error || "Failed to update");
    }
  };

  // ── Add allocation ──
  const handleAddAllocation = async () => {
    if (!newRoundId || !newTokenAmount) return;
    const res = await fetch("/api/admin/allocations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        investor_id: investorId,
        round_id: newRoundId,
        token_amount: Number(newTokenAmount),
      }),
    });
    if (res.ok) {
      toast.success("Allocation added");
      setNewRoundId("");
      setNewTokenAmount("");
      fetchData();
    } else {
      const err = await res.json();
      toast.error(err.error || "Failed to add allocation");
    }
  };

  // ── Remove allocation ──
  const handleRemoveAllocation = async (allocationId: string) => {
    if (!confirm("Remove this allocation?")) return;
    const res = await fetch(`/api/admin/allocations?id=${allocationId}`, { method: "DELETE" });
    if (res.ok) { toast.success("Allocation removed"); fetchData(); }
    else toast.error("Failed to remove allocation");
  };

  // ── Update payment ──
  const handleSavePayment = async (allocationId: string) => {
    const res = await fetch("/api/admin/payments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        allocation_id: allocationId,
        payment_status: paymentForm.payment_status,
        payment_method: paymentForm.payment_method || null,
        amount_received_usd: paymentForm.amount_received_usd
          ? Number(paymentForm.amount_received_usd)
          : null,
        tx_reference: paymentForm.tx_reference || null,
      }),
    });
    if (res.ok) {
      toast.success("Payment updated");
      setEditingPayment(null);
      fetchData();
    } else {
      const err = await res.json();
      toast.error(err.error || "Failed to update payment");
    }
  };

  // ── Send email manually ──
  const handleSendEmail = async (type: "welcome" | "capital_call") => {
    const label = type === "welcome" ? "Welcome email" : "Capital call email";
    const res = await fetch("/api/admin/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ investor_id: investorId, email_type: type }),
    });
    if (res.ok) {
      const result = await res.json();
      toast.success(result.message || `${label} sent`);
      fetchData();
    } else {
      const err = await res.json();
      toast.error(err.error || `Failed to send ${label}`);
    }
  };

  // ── Delete investor ──
  const handleDelete = async () => {
    if (!confirm(`Permanently delete ${investor?.full_name}? This cannot be undone.`)) return;
    const res = await fetch(`/api/admin/investors/${investorId}`, { method: "DELETE" });
    if (res.ok) { toast.success("Deleted"); router.push("/admin/investors"); }
    else toast.error("Failed to delete investor");
  };

  // ── Loading / not found ──
  if (loading) return <div className="flex items-center justify-center min-h-[40vh]"><p className="text-gray-400">Loading...</p></div>;
  if (!investor) return <div className="text-center py-12"><p className="text-gray-500">Investor not found.</p><Link href="/admin/investors" className="text-kayan-500 hover:underline text-sm mt-2 inline-block">← Back</Link></div>;

  // ── Payment summary (investor-level) ──
  const totalDue = investor.allocations.reduce((s, a) => s + Number(a.amount_usd || 0), 0);
  const totalReceived = investor.allocations.reduce((s, a) => s + Number(a.amount_received_usd || 0), 0);
  const allPaid = investor.allocations.length > 0 && investor.allocations.every(a => a.payment_status === "paid");

  // ── Helpers ──
  const inputCls = "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-kayan-500 disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed";
  const selectCls = `${inputCls} bg-white`;

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin/investors" className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{investor.full_name}</h1>
            <p className="text-sm text-gray-500">{investor.email}</p>
          </div>
          <KycBadge status={investor.kyc_status} />
          <PqBadge status={investor.pq_status || "not_sent"} />
        </div>
        {canWrite && (
          <Button variant="ghost" size="sm" onClick={handleDelete} className="text-red-500 hover:text-red-700 hover:bg-red-50">
            Delete Investor
          </Button>
        )}
      </div>

      {/* ── Investor Details + PQ Review ── */}
      <Card>
        <CardHeader title="Investor Details" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
            <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} disabled={!canWrite} className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} disabled={!canWrite} className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">KYC Status</label>
            <select value={kycStatus} onChange={e => setKycStatus(e.target.value)} disabled={!canWrite} className={selectCls}>
              <option value="unverified">Unverified</option>
              <option value="pending">Pending</option>
              <option value="verified">Verified</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">PQ Status</label>
            <select value={pqStatus} onChange={e => setPqStatus(e.target.value as PqStatus)} disabled={!canWrite} className={selectCls}>
              {Object.entries(PQ_STATUS_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* PQ Notes — shown when PQ has been sent or beyond */}
        {pqStatus !== "not_sent" && (
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">PQ Review Notes</label>
            <textarea
              value={pqNotes}
              onChange={e => setPqNotes(e.target.value)}
              disabled={!canWrite}
              rows={2}
              placeholder="Review notes, rejection reasons, or follow-up items..."
              className={`${inputCls} resize-none`}
            />
          </div>
        )}

        {/* PQ Review metadata */}
        {investor.pq_reviewed_at && (
          <p className="mt-2 text-xs text-gray-400">
            Reviewed by {investor.pq_reviewed_by || "—"} on{" "}
            {new Date(investor.pq_reviewed_at).toLocaleDateString()}
          </p>
        )}

        {canWrite && (
          <div className="mt-4">
            <Button onClick={handleSave} loading={saving}>Save Changes</Button>
            {pqStatus === "approved" && (
              <span className="ml-3 text-xs text-gray-400">
                Saving with PQ Approved will auto-send a capital call email if there are unpaid allocations.
              </span>
            )}
          </div>
        )}
      </Card>

      {/* ── Payment Summary (investor-level) ── */}
      {investor.allocations.length > 0 && (
        <Card>
          <CardHeader title="Payment Summary" subtitle="Aggregate view across all allocations" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <p className="text-xs text-gray-500 mb-1">Total Due</p>
              <p className="text-lg font-bold text-gray-900">
                {totalDue > 0 ? `$${totalDue.toLocaleString()}` : "—"}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <p className="text-xs text-gray-500 mb-1">Received</p>
              <p className="text-lg font-bold text-emerald-700">
                {totalReceived > 0 ? `$${totalReceived.toLocaleString()}` : "—"}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <p className="text-xs text-gray-500 mb-1">Outstanding</p>
              <p className="text-lg font-bold text-amber-700">
                {totalDue - totalReceived > 0 ? `$${(totalDue - totalReceived).toLocaleString()}` : "—"}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <p className="text-xs text-gray-500 mb-1">Status</p>
              <p className="text-sm font-medium mt-1">
                {allPaid
                  ? <span className="text-emerald-700">Fully Paid</span>
                  : investor.allocations.some(a => a.payment_status === "partial")
                    ? <span className="text-amber-700">Partial</span>
                    : <span className="text-gray-500">Awaiting Payment</span>
                }
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* ── Allocations + Payment Tracking ── */}
      <Card>
        <CardHeader title="Allocations & Payments" subtitle="Token allocations with payment status per round" />

        <div className="overflow-x-auto mb-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-3 px-2 font-medium text-gray-500">Round</th>
                <th className="text-right py-3 px-2 font-medium text-gray-500">Tokens</th>
                <th className="text-right py-3 px-2 font-medium text-gray-500">USD Due</th>
                <th className="text-center py-3 px-2 font-medium text-gray-500">Payment</th>
                <th className="text-center py-3 px-2 font-medium text-gray-500">Method</th>
                <th className="text-right py-3 px-2 font-medium text-gray-500">Received</th>
                <th className="text-right py-3 px-2 font-medium text-gray-500"></th>
              </tr>
            </thead>
            <tbody>
              {investor.allocations.map((alloc) => {
                const isEditing = editingPayment === alloc.id;
                const amountDue = Number(alloc.amount_usd) || Number(alloc.token_amount) * Number(alloc.saft_rounds.token_price || 0);

                return (
                  <tr key={alloc.id} className="border-b border-gray-50 last:border-0">
                    <td className="py-3 px-2 font-medium">{alloc.saft_rounds.name}</td>
                    <td className="py-3 px-2 text-right">{formatTokenAmount(Number(alloc.token_amount))}</td>
                    <td className="py-3 px-2 text-right">{amountDue > 0 ? `$${amountDue.toLocaleString()}` : "—"}</td>
                    <td className="py-3 px-2 text-center"><PaymentBadge status={alloc.payment_status} /></td>
                    <td className="py-3 px-2 text-center text-xs text-gray-500">
                      {alloc.payment_method ? PAYMENT_METHOD_LABELS[alloc.payment_method] : "—"}
                    </td>
                    <td className="py-3 px-2 text-right">
                      {alloc.amount_received_usd ? `$${Number(alloc.amount_received_usd).toLocaleString()}` : "—"}
                    </td>
                    <td className="py-3 px-2 text-right space-x-2">
                      {canWrite && !isEditing && (
                        <button
                          onClick={() => {
                            setEditingPayment(alloc.id);
                            setPaymentForm({
                              payment_status: alloc.payment_status,
                              payment_method: alloc.payment_method || "",
                              amount_received_usd: alloc.amount_received_usd ? String(alloc.amount_received_usd) : "",
                              tx_reference: alloc.tx_reference || "",
                            });
                          }}
                          className="text-kayan-500 hover:text-kayan-700 text-xs font-medium"
                        >
                          Edit
                        </button>
                      )}
                      {canWrite && (
                        <button onClick={() => handleRemoveAllocation(alloc.id)} className="text-red-500 hover:text-red-700 text-xs font-medium">
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {investor.allocations.length === 0 && (
                <tr><td colSpan={7} className="py-6 text-center text-gray-400">No allocations yet</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* ── Payment edit form (inline) ── */}
        {editingPayment && canWrite && (
          <div className="border-t border-gray-100 pt-4 mb-4">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Update Payment</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Status</label>
                <select
                  value={paymentForm.payment_status}
                  onChange={e => setPaymentForm(f => ({ ...f, payment_status: e.target.value as PaymentStatus }))}
                  className={selectCls}
                >
                  {Object.entries(PAYMENT_STATUS_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Method</label>
                <select
                  value={paymentForm.payment_method}
                  onChange={e => setPaymentForm(f => ({ ...f, payment_method: e.target.value as PaymentMethod | "" }))}
                  className={selectCls}
                >
                  <option value="">—</option>
                  {Object.entries(PAYMENT_METHOD_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Amount Received (USD)</label>
                <input
                  type="number"
                  value={paymentForm.amount_received_usd}
                  onChange={e => setPaymentForm(f => ({ ...f, amount_received_usd: e.target.value }))}
                  placeholder="0"
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Tx Reference</label>
                <input
                  type="text"
                  value={paymentForm.tx_reference}
                  onChange={e => setPaymentForm(f => ({ ...f, tx_reference: e.target.value }))}
                  placeholder="Wire ref / tx hash"
                  className={inputCls}
                />
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <Button size="sm" onClick={() => handleSavePayment(editingPayment)}>Save Payment</Button>
              <Button variant="secondary" size="sm" onClick={() => setEditingPayment(null)}>Cancel</Button>
            </div>
          </div>
        )}

        {/* ── Add new allocation ── */}
        {canWrite && (
          <div className="border-t border-gray-100 pt-4">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Add Allocation</h3>
            <div className="flex flex-col sm:flex-row gap-3">
              <select value={newRoundId} onChange={e => setNewRoundId(e.target.value)} className={`flex-1 ${selectCls}`}>
                <option value="">Select round...</option>
                {rounds.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              <input type="number" placeholder="Token amount" value={newTokenAmount} onChange={e => setNewTokenAmount(e.target.value)} className={`flex-1 ${inputCls}`} />
              <Button onClick={handleAddAllocation} disabled={!newRoundId || !newTokenAmount} size="md">Add</Button>
            </div>
          </div>
        )}
      </Card>

      {/* ── Email History & Actions ── */}
      <Card>
        <CardHeader title="Emails" subtitle="Sent emails and manual actions" />

        {/* Action buttons */}
        <div className="flex gap-2 mb-4 flex-wrap">
          <Button variant="secondary" size="sm" onClick={() => handleSendEmail("welcome")}>
            Resend Welcome Email
          </Button>
          {canWrite && (
            <Button variant="secondary" size="sm" onClick={() => handleSendEmail("capital_call")}>
              Send Capital Call
            </Button>
          )}
        </div>

        {/* Email log */}
        {investor.email_events && investor.email_events.length > 0 ? (
          <div className="space-y-2">
            {investor.email_events.map(ev => (
              <div key={ev.id} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg text-sm">
                <div className="flex items-center gap-3">
                  <span className={`inline-block w-2 h-2 rounded-full ${
                    ev.metadata?.sent_successfully ? "bg-emerald-400" : "bg-amber-400"
                  }`} />
                  <span className="font-medium text-gray-700 capitalize">
                    {ev.email_type.replace("_", " ")}
                  </span>
                  {ev.metadata?.trigger && (
                    <span className="text-xs text-gray-400">({ev.metadata.trigger})</span>
                  )}
                </div>
                <div className="text-xs text-gray-400">
                  {ev.sent_by && ev.sent_by !== "system" && <span>{ev.sent_by} · </span>}
                  {new Date(ev.sent_at).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400">No emails sent yet.</p>
        )}
      </Card>
    </div>
  );
}
