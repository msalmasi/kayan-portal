"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { KycBadge, PaymentBadge, PqBadge } from "@/components/ui/Badge";
import { PqReviewChecklist } from "@/components/admin/PqReviewChecklist";
import { InvestorWorkflowStepper } from "@/components/admin/InvestorWorkflowStepper";
import { useAdminRole } from "@/lib/hooks";
import { formatTokenAmount } from "@/lib/vesting";
import {
  InvestorWithAllocations,
  SaftRound,
  EmailEvent,
  PqFormData,
  PqReviewData,
  PaymentStatus,
  PaymentMethod,
  PqStatus,
  PAYMENT_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  PQ_STATUS_LABELS,
} from "@/lib/types";

// ── Extended investor type with email events + PQ data + documents ──
interface InvestorFull extends InvestorWithAllocations {
  email_events: EmailEvent[];
  pq_data: PqFormData | null;
  pq_review: PqReviewData | null;
  investor_documents: InvestorDocItem[];
  payment_claims: PaymentClaimItem[];
}

interface PaymentClaimItem {
  id: string;
  round_id: string;
  method: string;
  amount_usd: number;
  amount_verified_usd: number | null;
  status: string;
  tx_hash: string | null;
  wire_reference: string | null;
  from_wallet: string | null;
  chain: string | null;
  token: string | null;
  chain_data: Record<string, any>;
  verified_at: string | null;
  verified_by: string | null;
  rejection_reason: string | null;
  created_at: string;
}

interface InvestorDocItem {
  id: string;
  doc_type: string;
  round_id: string | null;
  status: string;
  signed_at: string | null;
  signature_name: string | null;
  signature_ip: string | null;
  created_at: string;
  saft_rounds: { name: string } | null;
  download_url: string | null;
  signed_pdf_url: string | null;
  missing_variables: { key: string; label: string }[];
}

export default function InvestorDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { canWrite, isManager } = useAdminRole();
  const investorId = params.id as string;

  const [investor, setInvestor] = useState<InvestorFull | null>(null);
  const [rounds, setRounds] = useState<SaftRound[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Editable investor fields
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [kycStatus, setKycStatus] = useState("unverified");

  // New allocation form
  const [newRoundId, setNewRoundId] = useState("");
  const [newTokenAmount, setNewTokenAmount] = useState("");

  // Payment edit state
  const [editingPayment, setEditingPayment] = useState<string | null>(null);
  const [paymentForm, setPaymentForm] = useState<{
    payment_status: PaymentStatus;
    payment_method: PaymentMethod | "";
    amount_received_usd: string;
    tx_reference: string;
  }>({ payment_status: "unpaid", payment_method: "", amount_received_usd: "", tx_reference: "" });

  // ── Fetch ──
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
    }
    if (roundsRes.ok) setRounds(await roundsRes.json());
    setLoading(false);
  }, [investorId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Save investor details (name, email, KYC) ──
  const handleSave = async () => {
    setSaving(true);
    const res = await fetch(`/api/admin/investors/${investorId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ full_name: fullName, email, kyc_status: kycStatus }),
    });
    setSaving(false);
    if (res.ok) {
      const result = await res.json();
      const msgs = [];
      if (result.docs_sent) msgs.push("subscription docs sent");
      if (result.capital_call_sent) msgs.push("capital call issued");
      toast.success(`Investor updated${msgs.length ? " — " + msgs.join(", ") : ""}`);
      fetchData();
    } else {
      const err = await res.json();
      toast.error(err.error || "Failed to update");
    }
  };

  // ── PQ review save handler ──
  const handlePqReviewSave = async (updates: {
    pq_status: PqStatus;
    pq_review: PqReviewData;
    pq_notes: string;
    pq_reviewed_by: string;
  }) => {
    const res = await fetch(`/api/admin/investors/${investorId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (res.ok) {
      const result = await res.json();
      if (result.capital_call_sent) {
        const cc = result.capital_call_status;
        const parts: string[] = [];
        if (cc?.capital_calls_sent > 0) parts.push(`${cc.capital_calls_sent} capital call(s) sent`);
        if (cc?.grants_confirmed > 0) parts.push(`${cc.grants_confirmed} grant(s) confirmed`);
        toast.success(`PQ approved — ${parts.join(", ") || "automation triggered"}`);
      } else if (updates.pq_status === "approved" && result.capital_call_status?.pending?.length > 0) {
        // PQ approved but capital call waiting on other gates
        const reasons = result.capital_call_status.pending.join(", ");
        toast.success(`PQ approved — capital call pending: ${reasons}`);
      } else if (updates.pq_status === "rejected") {
        toast.success("PQ rejected — investor will be notified to resubmit");
      } else {
        toast.success("PQ review saved");
      }
      fetchData();
    } else {
      const err = await res.json();
      toast.error(err.error || "Failed to save review");
    }
  };

  // ── Send docs manually ──
  const handleSendDocs = async () => {
    const res = await fetch(`/api/admin/investors/${investorId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        docs_sent_at: new Date().toISOString(),
        pq_status: investor?.pq_status === "not_sent" ? "sent" : investor?.pq_status,
      }),
    });
    if (res.ok) {
      toast.success("Docs marked as sent — PQ status updated");
      fetchData();
    }
  };

  // ── Allocation handlers ──
  const handleAddAllocation = async () => {
    if (!newRoundId || !newTokenAmount) return;
    const res = await fetch("/api/admin/allocations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ investor_id: investorId, round_id: newRoundId, token_amount: Number(newTokenAmount) }),
    });
    if (res.ok) {
      const data = await res.json();
      toast.success(data._message || "Allocation added");
      setNewRoundId(""); setNewTokenAmount(""); fetchData();
    }
    else { const err = await res.json(); toast.error(err.error || "Failed"); }
  };

  const handleRemoveAllocation = async (id: string) => {
    if (!confirm("Remove this allocation?")) return;
    const res = await fetch(`/api/admin/allocations?id=${id}`, { method: "DELETE" });
    if (res.ok) { toast.success("Removed"); fetchData(); } else toast.error("Failed");
  };

  const handleApproveAllocation = async (id: string) => {
    const res = await fetch("/api/admin/allocations/approve", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allocation_id: id, action: "approve" }),
    });
    if (res.ok) { toast.success("Allocation approved"); fetchData(); }
    else { const err = await res.json(); toast.error(err.error || "Failed"); }
  };

  const handleRejectAllocation = async (id: string) => {
    const reason = prompt("Reason for rejection (optional):");
    if (reason === null) return; // cancelled
    const res = await fetch("/api/admin/allocations/approve", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allocation_id: id, action: "reject", reason }),
    });
    if (res.ok) { toast.success("Allocation rejected"); fetchData(); }
    else { const err = await res.json(); toast.error(err.error || "Failed"); }
  };

  const handleSavePayment = async (id: string) => {
    const res = await fetch("/api/admin/payments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        allocation_id: id,
        payment_status: paymentForm.payment_status,
        payment_method: paymentForm.payment_method || null,
        amount_received_usd: paymentForm.amount_received_usd ? Number(paymentForm.amount_received_usd) : null,
        tx_reference: paymentForm.tx_reference || null,
      }),
    });
    if (res.ok) { toast.success("Payment updated"); setEditingPayment(null); fetchData(); }
    else { const err = await res.json(); toast.error(err.error || "Failed"); }
  };

  // ── Document generation handler ──
  const [generatingDocs, setGeneratingDocs] = useState(false);
  const handleGenerateDocs = async (roundId: string) => {
    setGeneratingDocs(true);
    const res = await fetch("/api/admin/documents/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ investor_id: investorId, round_id: roundId }),
    });
    setGeneratingDocs(false);
    if (res.ok) {
      const result = await res.json();
      toast.success(`Documents generated — ${result.documents?.length || 0} docs, email ${result.email_sent ? "sent" : "logged"}`);
      fetchData();
    } else {
      const err = await res.json();
      toast.error(err.error || "Failed to generate documents");
    }
  };

  // ── Email handlers ──
  const handleSendEmail = async (type: string) => {
    const res = await fetch("/api/admin/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ investor_id: investorId, email_type: type }),
    });
    if (res.ok) { const r = await res.json(); toast.success(r.message); fetchData(); }
    else { const err = await res.json(); toast.error(err.error || "Failed"); }
  };

  const handleDelete = async () => {
    if (!confirm(`Permanently delete ${investor?.full_name}? This cannot be undone.`)) return;
    const res = await fetch(`/api/admin/investors/${investorId}`, { method: "DELETE" });
    if (res.ok) { toast.success("Deleted"); router.push("/admin/investors"); }
    else toast.error("Failed");
  };

  // ── States ──
  if (loading) return <div className="flex items-center justify-center min-h-[40vh]"><p className="text-gray-400">Loading...</p></div>;
  if (!investor) return <div className="text-center py-12"><p className="text-gray-500">Investor not found.</p><Link href="/admin/investors" className="text-kayan-500 hover:underline text-sm mt-2 inline-block">← Back</Link></div>;

  const inputCls = "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-kayan-500 disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed";
  const selectCls = `${inputCls} bg-white`;

  const payableAllocs = investor.allocations.filter(a => a.payment_status !== "grant" && (a as any).approval_status === "approved");
  const grantAllocs = investor.allocations.filter(a => a.payment_status === "grant" && (a as any).approval_status === "approved");
  const totalDue = payableAllocs.reduce((s, a) => s + Number(a.amount_usd || 0), 0);
  const totalReceived = payableAllocs.reduce((s, a) => s + Number(a.amount_received_usd || 0), 0);
  const allPaid = investor.allocations.length > 0 && investor.allocations.every(a => a.payment_status === "paid" || a.payment_status === "grant");

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
            Delete
          </Button>
        )}
      </div>

      {/* ── Workflow Progress ── */}
      <Card>
        <CardHeader title="Workflow Progress" subtitle="Investor onboarding pipeline" />
        <InvestorWorkflowStepper investor={investor} />
      </Card>

      {/* ── Investor Details ── */}
      <Card>
        <CardHeader title="Investor Details" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
        </div>
        {investor.sumsub_applicant_id && (
          <p className="mt-2 text-xs text-gray-400">Sumsub ID: {investor.sumsub_applicant_id}</p>
        )}
        {canWrite && (
          <div className="mt-4 flex items-center gap-3">
            <Button onClick={handleSave} loading={saving}>Save Changes</Button>
            {kycStatus === "verified" && (
              <span className="text-xs text-gray-400">
                Setting KYC to Verified will auto-send subscription docs if not already sent.
              </span>
            )}
          </div>
        )}
      </Card>

      {/* ── PQ Review Checklist ── */}
      <PqReviewChecklist
        investorId={investorId}
        pqStatus={(investor.pq_status || "not_sent") as PqStatus}
        pqData={investor.pq_data}
        pqReview={investor.pq_review}
        pqNotes={investor.pq_notes}
        pqReviewedBy={investor.pq_reviewed_by}
        pqReviewedAt={investor.pq_reviewed_at}
        canWrite={canWrite}
        onSave={handlePqReviewSave}
      />

      {/* ── Payment Summary ── */}
      {investor.allocations.length > 0 && (
        <Card>
          <CardHeader title="Payment Summary" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <p className="text-xs text-gray-500 mb-1">Total Due</p>
              <p className="text-lg font-bold text-gray-900">{totalDue > 0 ? `$${totalDue.toLocaleString()}` : "—"}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <p className="text-xs text-gray-500 mb-1">Received</p>
              <p className="text-lg font-bold text-emerald-700">{totalReceived > 0 ? `$${totalReceived.toLocaleString()}` : "—"}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <p className="text-xs text-gray-500 mb-1">Outstanding</p>
              <p className="text-lg font-bold text-amber-700">{totalDue - totalReceived > 0 ? `$${(totalDue - totalReceived).toLocaleString()}` : "—"}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <p className="text-xs text-gray-500 mb-1">Status</p>
              <p className="text-sm font-medium mt-1">
                {allPaid ? <span className="text-emerald-700">Fully {grantAllocs.length > 0 && payableAllocs.length === 0 ? "Granted" : "Paid"}</span>
                  : payableAllocs.some(a => a.payment_status === "partial") ? <span className="text-amber-700">Partial</span>
                  : <span className="text-gray-500">Awaiting</span>}
              </p>
              {grantAllocs.length > 0 && payableAllocs.length > 0 && (
                <p className="text-[10px] text-gray-400 mt-1">
                  + {formatTokenAmount(grantAllocs.reduce((s, a) => s + Number(a.token_amount), 0))} granted
                </p>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* ── Allocations & Payments ── */}
      <Card>
        <CardHeader title="Allocations & Payments" />
        <div className="overflow-x-auto mb-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-3 px-2 font-medium text-gray-500">Round</th>
                <th className="text-right py-3 px-2 font-medium text-gray-500">Tokens</th>
                <th className="text-right py-3 px-2 font-medium text-gray-500">USD</th>
                <th className="text-center py-3 px-2 font-medium text-gray-500">Status</th>
                <th className="text-center py-3 px-2 font-medium text-gray-500">Payment</th>
                <th className="text-center py-3 px-2 font-medium text-gray-500">Method</th>
                <th className="text-right py-3 px-2 font-medium text-gray-500">Received</th>
                <th className="text-right py-3 px-2 font-medium text-gray-500"></th>
              </tr>
            </thead>
            <tbody>
              {investor.allocations.map((alloc) => {
                const isEditing = editingPayment === alloc.id;
                const due = Number(alloc.amount_usd) || Number(alloc.token_amount) * Number(alloc.saft_rounds.token_price || 0);
                const approval = (alloc as any).approval_status || "approved";
                const isPending = approval === "pending";
                const isRejected = approval === "rejected";
                return (
                  <tr key={alloc.id} className={`border-b border-gray-50 last:border-0 ${isPending ? "bg-amber-50/50" : isRejected ? "bg-red-50/30 opacity-60" : ""}`}>
                    <td className="py-3 px-2 font-medium">{alloc.saft_rounds.name}</td>
                    <td className="py-3 px-2 text-right">{formatTokenAmount(Number(alloc.token_amount))}</td>
                    <td className="py-3 px-2 text-right">{due > 0 ? `$${due.toLocaleString()}` : "—"}</td>
                    <td className="py-3 px-2 text-center">
                      {isPending && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">Pending</span>}
                      {isRejected && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">Rejected</span>}
                      {approval === "approved" && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">Approved</span>}
                    </td>
                    <td className="py-3 px-2 text-center"><PaymentBadge status={alloc.payment_status} /></td>
                    <td className="py-3 px-2 text-center text-xs text-gray-500">{alloc.payment_method ? PAYMENT_METHOD_LABELS[alloc.payment_method] : "—"}</td>
                    <td className="py-3 px-2 text-right">{alloc.amount_received_usd ? `$${Number(alloc.amount_received_usd).toLocaleString()}` : "—"}</td>
                    <td className="py-3 px-2 text-right space-x-2">
                      {/* Pending: show approve/reject for managers */}
                      {isPending && isManager && (
                        <>
                          <button onClick={() => handleApproveAllocation(alloc.id)} className="text-emerald-600 hover:text-emerald-800 text-xs font-medium">Approve</button>
                          <button onClick={() => handleRejectAllocation(alloc.id)} className="text-red-500 hover:text-red-700 text-xs font-medium">Reject</button>
                        </>
                      )}
                      {/* Approved: show edit/remove for managers only */}
                      {!isPending && !isRejected && isManager && !isEditing && (
                        <button onClick={() => { setEditingPayment(alloc.id); setPaymentForm({ payment_status: alloc.payment_status, payment_method: alloc.payment_method || "", amount_received_usd: alloc.amount_received_usd ? String(alloc.amount_received_usd) : "", tx_reference: alloc.tx_reference || "" }); }} className="text-kayan-500 hover:text-kayan-700 text-xs font-medium">Edit</button>
                      )}
                      {isManager && !isPending && <button onClick={() => handleRemoveAllocation(alloc.id)} className="text-red-500 hover:text-red-700 text-xs font-medium">Remove</button>}
                    </td>
                  </tr>
                );
              })}
              {investor.allocations.length === 0 && <tr><td colSpan={8} className="py-6 text-center text-gray-400">No allocations</td></tr>}
            </tbody>
          </table>
        </div>

        {/* Payment edit form */}
        {editingPayment && isManager && (
          <div className="border-t border-gray-100 pt-4 mb-4">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Update Payment</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Status</label>
                <select value={paymentForm.payment_status} onChange={e => setPaymentForm(f => ({ ...f, payment_status: e.target.value as PaymentStatus }))} className={selectCls}>
                  {Object.entries(PAYMENT_STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Method</label>
                <select value={paymentForm.payment_method} onChange={e => setPaymentForm(f => ({ ...f, payment_method: e.target.value as PaymentMethod | "" }))} className={selectCls}>
                  <option value="">—</option>
                  {Object.entries(PAYMENT_METHOD_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Received (USD)</label>
                <input type="number" value={paymentForm.amount_received_usd} onChange={e => setPaymentForm(f => ({ ...f, amount_received_usd: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Tx Reference</label>
                <input type="text" value={paymentForm.tx_reference} onChange={e => setPaymentForm(f => ({ ...f, tx_reference: e.target.value }))} placeholder="Wire ref / tx hash" className={inputCls} />
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <Button size="sm" onClick={() => handleSavePayment(editingPayment)}>Save</Button>
              <Button variant="secondary" size="sm" onClick={() => setEditingPayment(null)}>Cancel</Button>
            </div>
          </div>
        )}

        {/* Add allocation — all roles can add; staff proposals need manager approval */}
        <div className="border-t border-gray-100 pt-4">
          <h3 className="text-sm font-medium text-gray-700 mb-1">Add Allocation</h3>
          {!isManager && (
            <p className="text-xs text-amber-600 mb-3">
              Your allocation will be submitted as a proposal and requires manager approval.
            </p>
          )}
          <div className="flex flex-col sm:flex-row gap-3">
            <select value={newRoundId} onChange={e => setNewRoundId(e.target.value)} className={`flex-1 ${selectCls}`}>
              <option value="">Select round...</option>
              {rounds.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <input type="number" placeholder="Token amount" value={newTokenAmount} onChange={e => setNewTokenAmount(e.target.value)} className={`flex-1 ${inputCls}`} />
            <Button onClick={handleAddAllocation} disabled={!newRoundId || !newTokenAmount} size="md">
              {isManager ? "Add" : "Propose"}
            </Button>
          </div>
        </div>
      </Card>

      {/* ── Documents ── */}
      <Card>
        <CardHeader title="Subscription Documents" subtitle="Generated SAFT, PPM, and CIS per round" />
        {investor.investor_documents && investor.investor_documents.length > 0 ? (
          <div className="space-y-3 mb-4">
            {investor.investor_documents.map((doc) => (
              <div key={doc.id} className="flex items-center justify-between py-3 px-4 bg-gray-50 rounded-lg text-sm">
                <div className="flex items-center gap-3">
                  <span className={`inline-block w-2 h-2 rounded-full ${
                    doc.status === "signed" ? "bg-emerald-400"
                    : doc.status === "viewed" ? "bg-blue-400"
                    : "bg-gray-300"
                  }`} />
                  <div>
                    <span className="font-medium text-gray-700">
                      {doc.doc_type.toUpperCase()}
                    </span>
                    {doc.saft_rounds?.name && (
                      <span className="text-gray-400 ml-1">— {doc.saft_rounds.name}</span>
                    )}
                    {doc.status === "signed" && doc.signature_name && (
                      <p className="text-xs text-emerald-600 mt-0.5">
                        Signed by {doc.signature_name} · {new Date(doc.signed_at!).toLocaleString()}
                        {doc.signature_ip && <span className="text-gray-400"> · IP {doc.signature_ip}</span>}
                      </p>
                    )}
                    {doc.doc_type === "saft" && doc.missing_variables?.length > 0 && doc.status !== "signed" && (
                      <p className="text-xs text-amber-600 mt-0.5">
                        ⚠ Awaiting investor input: {doc.missing_variables.map((m) => m.label).join(", ")}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    doc.status === "signed" ? "bg-emerald-100 text-emerald-700"
                    : doc.status === "viewed" ? "bg-blue-100 text-blue-700"
                    : "bg-gray-100 text-gray-600"
                  }`}>
                    {doc.status === "signed" ? "Signed" : doc.status === "viewed" ? "Viewed" : "Pending"}
                  </span>
                  {/* Download links */}
                  {doc.download_url && (
                    <a
                      href={doc.download_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-kayan-600 hover:text-kayan-800 font-medium underline"
                    >
                      {doc.doc_type === "saft" ? "Download SAFT" : "Download PDF"}
                    </a>
                  )}
                  {doc.signed_pdf_url && (
                    <a
                      href={doc.signed_pdf_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-emerald-600 hover:text-emerald-800 font-medium underline"
                    >
                      Certificate
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400 mb-4">No documents generated yet.</p>
        )}

        {/* Generate docs per round */}
        {canWrite && investor.allocations.length > 0 && (
          <div className="border-t border-gray-100 pt-4">
            <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Generate Documents</h4>
            <div className="flex flex-wrap gap-2">
              {/* Get unique rounds from allocations */}
              {Array.from(new Set(investor.allocations.map(a => a.round_id))).map(roundId => {
                const roundName = investor.allocations.find(a => a.round_id === roundId)?.saft_rounds?.name || "Unknown";
                const existingSaft = investor.investor_documents?.find(
                  d => d.doc_type === "saft" && d.round_id === roundId
                );
                const isSigned = existingSaft?.status === "signed";
                return (
                  <Button
                    key={roundId}
                    variant={existingSaft ? "ghost" : "secondary"}
                    size="sm"
                    onClick={() => handleGenerateDocs(roundId)}
                    disabled={generatingDocs || isSigned}
                    loading={generatingDocs}
                    title={isSigned ? "Cannot re-generate a signed document" : ""}
                  >
                    {isSigned
                      ? `✓ ${roundName} (Signed)`
                      : existingSaft
                        ? `↻ Re-generate ${roundName}`
                        : `Generate for ${roundName}`}
                  </Button>
                );
              })}
            </div>
          </div>
        )}
      </Card>

      {/* ── Capital Calls — Per Round ── */}
      {(() => {
        // Group approved allocations by round
        const approvedAllocs = investor.allocations.filter(
          (a: any) => (a as any).approval_status === "approved"
        );
        const pendingByRound = investor.allocations.filter(
          (a: any) => (a as any).approval_status === "pending"
        );

        // Get unique round IDs (approved + pending, skip rejected)
        const allRoundIds = Array.from(
          new Set(investor.allocations
            .filter((a: any) => (a as any).approval_status !== "rejected")
            .map((a) => a.round_id))
        );

        if (allRoundIds.length === 0) return null;

        const pqApproved = investor.pq_status === "approved";

        // Helper: find email events for a specific round
        // Supports both new format (round_id) and legacy (rounds array of names)
        const findEmailForRound = (type: string, roundId: string, roundName: string) => {
          return investor.email_events?.find(
            (e: EmailEvent) =>
              e.email_type === type &&
              (e.metadata?.round_id === roundId || e.metadata?.rounds?.includes(roundName))
          ) || null;
        };

        return (
          <Card>
            <CardHeader
              title="Capital Calls"
              subtitle="Per-round payment tracking — auto-triggers when PQ approved + SAFT signed"
            />
            <div className="space-y-3">
              {allRoundIds.map((roundId) => {
                const roundApproved = approvedAllocs.filter((a) => a.round_id === roundId);
                const roundPending = pendingByRound.filter((a) => a.round_id === roundId);

                // ── Pending-only round ──
                if (roundApproved.length === 0 && roundPending.length > 0) {
                  const roundName = roundPending[0]?.saft_rounds?.name || "Unknown";
                  return (
                    <div key={roundId} className="border border-gray-200 rounded-lg p-4 bg-gray-50/50">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm text-gray-700">{roundName}</span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-700">
                            Pending Approval
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-gray-400 mt-2">
                        {roundPending.length} allocation proposal{roundPending.length > 1 ? "s" : ""} awaiting manager approval.
                      </p>
                    </div>
                  );
                }

                if (roundApproved.length === 0) return null;

                const roundName = roundApproved[0]?.saft_rounds?.name || "Unknown";
                const tokenPrice = Number(roundApproved[0]?.saft_rounds?.token_price || 0);
                const totalTokens = roundApproved.reduce((s, a) => s + Number(a.token_amount), 0);
                const totalDueRound = roundApproved.reduce(
                  (s, a) => s + (Number(a.amount_usd) || Number(a.token_amount) * tokenPrice), 0
                );
                const totalReceivedRound = roundApproved.reduce(
                  (s, a) => s + Number(a.amount_received_usd || 0), 0
                );

                // Payment classification
                const isGrant = roundApproved.every((a) => a.payment_status === "grant");
                const isFullyPaid = roundApproved.every(
                  (a) => a.payment_status === "paid" || a.payment_status === "grant"
                );
                const isPartialPaid = !isFullyPaid && roundApproved.some(
                  (a) => a.payment_status === "paid" || a.payment_status === "partial"
                );
                const isInvoiced = roundApproved.some((a) => a.payment_status === "invoiced");
                const hasUnpaid = roundApproved.some((a) => a.payment_status === "unpaid");

                // Document status
                const saftSigned = investor.investor_documents?.some(
                  (d) => d.doc_type === "saft" && d.round_id === roundId && d.status === "signed"
                );
                const saftExists = investor.investor_documents?.some(
                  (d) => d.doc_type === "saft" && d.round_id === roundId
                );

                // Email events for this round
                const capitalCallEvent = findEmailForRound("capital_call", roundId, roundName);
                const confirmationEvent = findEmailForRound("allocation_confirmed", roundId, roundName);

                const allGatesMet = pqApproved && saftSigned;

                // ── Visual style by state ──
                let statusLabel: string;
                let bgColor: string;
                let borderColor: string;
                let statusColor: string;

                if (isGrant) {
                  statusLabel = "Grant — No Payment Required";
                  bgColor = "bg-emerald-50/50"; borderColor = "border-emerald-200"; statusColor = "text-emerald-700";
                } else if (isFullyPaid) {
                  statusLabel = "Payment Confirmed";
                  bgColor = "bg-emerald-50/50"; borderColor = "border-emerald-200"; statusColor = "text-emerald-700";
                } else if (isPartialPaid) {
                  statusLabel = `Partial — $${totalReceivedRound.toLocaleString()} of $${totalDueRound.toLocaleString()}`;
                  bgColor = "bg-amber-50/30"; borderColor = "border-amber-200"; statusColor = "text-amber-700";
                } else if (isInvoiced || capitalCallEvent) {
                  statusLabel = "Capital Call Sent — Awaiting Payment";
                  bgColor = "bg-blue-50/30"; borderColor = "border-blue-200"; statusColor = "text-blue-700";
                } else if (allGatesMet && hasUnpaid) {
                  statusLabel = "Ready to Send";
                  bgColor = "bg-amber-50/30"; borderColor = "border-amber-200"; statusColor = "text-amber-700";
                } else {
                  statusLabel = "Waiting on Prerequisites";
                  bgColor = "bg-gray-50/50"; borderColor = "border-gray-200"; statusColor = "text-gray-500";
                }

                return (
                  <div key={roundId} className={`border rounded-lg p-4 ${bgColor} ${borderColor}`}>
                    {/* ── Round header ── */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm text-gray-900">{roundName}</span>
                        <span className="text-xs text-gray-400">
                          {formatTokenAmount(totalTokens)} tokens
                          {!isGrant && totalDueRound > 0 && ` · $${totalDueRound.toLocaleString()}`}
                        </span>
                        {roundPending.length > 0 && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700">
                            +{roundPending.length} pending
                          </span>
                        )}
                      </div>
                      <span className={`text-xs font-medium ${statusColor}`}>{statusLabel}</span>
                    </div>

                    {/* ── GRANT round ── */}
                    {isGrant && (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm text-emerald-700">
                          <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                          </svg>
                          <span>Token grant — capital call not required</span>
                        </div>
                        {confirmationEvent && (
                          <span className="text-xs text-emerald-500">
                            Confirmation sent {new Date(confirmationEvent.sent_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    )}

                    {/* ── FULLY PAID round ── */}
                    {!isGrant && isFullyPaid && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm text-emerald-700">
                          <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                          </svg>
                          <span>Payment received — ${totalReceivedRound.toLocaleString()}</span>
                        </div>
                        {roundApproved.some((a) => a.tx_reference) && (
                          <div className="text-xs text-gray-500 pl-6 space-x-2">
                            {roundApproved.filter((a) => a.tx_reference).map((a, i) => (
                              <span key={i}>
                                {roundApproved.filter(x => x.tx_reference).length > 1 && `#${i + 1}: `}
                                <code className="bg-gray-100 px-1.5 py-0.5 rounded text-[11px]">{a.tx_reference}</code>
                              </span>
                            ))}
                          </div>
                        )}
                        {roundApproved.some((a) => a.payment_method) && (
                          <p className="text-xs text-gray-400 pl-6">
                            via {PAYMENT_METHOD_LABELS[roundApproved.find((a) => a.payment_method)!.payment_method!]}
                          </p>
                        )}
                        {confirmationEvent && (
                          <p className="text-xs text-emerald-500 pl-6">
                            Confirmation email sent {new Date(confirmationEvent.sent_at).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    )}

                    {/* ── PARTIAL PAID round ── */}
                    {!isGrant && isPartialPaid && (
                      <div className="space-y-2">
                        <div className="w-full bg-gray-200 rounded-full h-1.5">
                          <div
                            className="bg-amber-500 h-1.5 rounded-full transition-all"
                            style={{ width: `${Math.min(100, (totalReceivedRound / totalDueRound) * 100)}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-500">${totalReceivedRound.toLocaleString()} received</span>
                          <span className="text-amber-600 font-medium">${(totalDueRound - totalReceivedRound).toLocaleString()} outstanding</span>
                        </div>
                        {capitalCallEvent && (
                          <div className="flex items-center gap-2 text-xs text-blue-600 pt-1 border-t border-gray-100">
                            <span>Capital call sent {new Date(capitalCallEvent.sent_at).toLocaleDateString()}</span>
                            {canWrite && (
                              <Button variant="ghost" size="sm" onClick={() => handleSendEmail("capital_call")} className="ml-auto text-[11px] py-0">
                                Resend
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* ── INVOICED / CAPITAL CALL SENT (awaiting payment) ── */}
                    {!isGrant && !isFullyPaid && !isPartialPaid && (isInvoiced || capitalCallEvent) && (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400" />
                        <span className="text-blue-700">
                          Capital call sent{capitalCallEvent && ` on ${new Date(capitalCallEvent.sent_at).toLocaleDateString()}`}
                        </span>
                        <span className="text-gray-400">·</span>
                        <span className="text-gray-500">${totalDueRound.toLocaleString()} due</span>
                        {canWrite && (
                          <Button variant="ghost" size="sm" onClick={() => handleSendEmail("capital_call")} className="ml-auto text-[11px] py-0">
                            Resend
                          </Button>
                        )}
                      </div>
                    )}

                    {/* ── UNPAID — show prerequisite gates ── */}
                    {!isGrant && !isFullyPaid && !isPartialPaid && !isInvoiced && !capitalCallEvent && (
                      <div className="space-y-2">
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { label: "Allocation", met: roundApproved.length > 0 },
                            { label: "PQ Approved", met: pqApproved },
                            { label: "SAFT Signed", met: !!saftSigned },
                          ].map((gate) => (
                            <div key={gate.label} className="flex items-center gap-1.5 text-xs">
                              <span className={`inline-block w-1.5 h-1.5 rounded-full ${gate.met ? "bg-emerald-400" : "bg-gray-300"}`} />
                              <span className={gate.met ? "text-gray-600" : "text-gray-400"}>
                                {gate.label} {gate.met ? "✓" : "—"}
                              </span>
                            </div>
                          ))}
                        </div>

                        {!saftExists && (
                          <p className="text-xs text-gray-400 mt-1">
                            Documents not yet generated for this round.
                          </p>
                        )}

                        {allGatesMet && hasUnpaid && (
                          <div className="flex items-center gap-2 mt-1 pt-2 border-t border-gray-100">
                            <p className="text-xs text-amber-600">All conditions met — capital call ready to send.</p>
                            {canWrite && (
                              <Button variant="secondary" size="sm" onClick={() => handleSendEmail("capital_call")} className="ml-auto text-xs">
                                Send Capital Call
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })()}
      {/* ── Emails ── */}

      {/* ── Payment Claims — Investor-submitted payment evidence ── */}
      {investor.payment_claims && investor.payment_claims.length > 0 && (() => {
        const CLAIM_METHOD_LABELS: Record<string, string> = {
          wire: "Wire Transfer", usdc_eth: "USDC (Ethereum)",
          usdc_sol: "USDC (Solana)", usdt_eth: "USDT (Ethereum)",
        };
        const CLAIM_STATUS_STYLES: Record<string, string> = {
          pending:   "bg-amber-100 text-amber-700",
          verifying: "bg-blue-100 text-blue-700",
          verified:  "bg-emerald-100 text-emerald-700",
          rejected:  "bg-red-100 text-red-700",
        };
        const CLAIM_STATUS_LABELS: Record<string, string> = {
          pending: "Pending Review", verifying: "Verifying",
          verified: "Verified ✓", rejected: "Rejected",
        };

        return (
          <Card>
            <CardHeader
              title="Payment Claims"
              subtitle="Investor-submitted payment evidence — review and approve/reject"
            />
            <div className="space-y-3">
              {investor.payment_claims.map((claim: PaymentClaimItem) => {
                const isPending = claim.status === "pending" || claim.status === "verifying";
                const isWire = claim.method === "wire";
                const explorerUrl = claim.tx_hash
                  ? (claim.chain === "solana"
                    ? `https://solscan.io/tx/${claim.tx_hash}`
                    : `https://etherscan.io/tx/${claim.tx_hash}`)
                  : null;
                const verifiedAmt = (claim as any).amount_verified_usd;
                const isPartialVerify = verifiedAmt != null && verifiedAmt < Number(claim.amount_usd);

                return (
                  <div
                    key={claim.id}
                    className={`border rounded-lg p-4 ${
                      isPending ? "border-amber-200 bg-amber-50/30" : "border-gray-200 bg-gray-50/50"
                    }`}
                  >
                    {/* Header row: method, status, amounts */}
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900">
                            {CLAIM_METHOD_LABELS[claim.method] || claim.method}
                          </span>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${CLAIM_STATUS_STYLES[claim.status] || "bg-gray-100 text-gray-600"}`}>
                            {CLAIM_STATUS_LABELS[claim.status] || claim.status}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Submitted {new Date(claim.created_at).toLocaleString()}
                        </p>
                      </div>
                      <div className="text-right">
                        {/* Show claimed amount, plus verified amount if different */}
                        {isPartialVerify ? (
                          <>
                            <p className="text-sm text-gray-400 line-through">
                              ${Number(claim.amount_usd).toLocaleString()} claimed
                            </p>
                            <p className="text-lg font-bold text-emerald-700">
                              ${Number(verifiedAmt).toLocaleString()} verified
                            </p>
                          </>
                        ) : verifiedAmt != null ? (
                          <p className="text-lg font-bold text-emerald-700">
                            ${Number(verifiedAmt).toLocaleString()}
                          </p>
                        ) : (
                          <p className="text-lg font-bold text-gray-900">
                            ${Number(claim.amount_usd).toLocaleString()}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Reference details */}
                    <div className="text-xs text-gray-500 space-y-1 mb-3">
                      {claim.tx_hash && (
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-600">Tx Hash:</span>
                          <code className="font-mono bg-white px-1.5 py-0.5 rounded border text-gray-700 break-all">
                            {claim.tx_hash}
                          </code>
                          {explorerUrl && (
                            <a href={explorerUrl} target="_blank" rel="noopener noreferrer" className="text-kayan-600 hover:text-kayan-800 shrink-0">
                              View ↗
                            </a>
                          )}
                        </div>
                      )}
                      {claim.from_wallet && (
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-600">From:</span>
                          <code className="font-mono bg-white px-1.5 py-0.5 rounded border text-gray-700 break-all">
                            {claim.from_wallet}
                          </code>
                        </div>
                      )}
                      {claim.wire_reference && (
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-600">Wire Ref:</span>
                          <span className="text-gray-700">{claim.wire_reference}</span>
                        </div>
                      )}
                      {claim.verified_by && (
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-600">
                            {claim.status === "verified" ? "Verified by:" : "Reviewed by:"}
                          </span>
                          <span className="text-gray-700">
                            {claim.verified_by === "auto" ? "Auto (on-chain)" : claim.verified_by}
                          </span>
                          {claim.verified_at && (
                            <span className="text-gray-400">
                              · {new Date(claim.verified_at).toLocaleString()}
                            </span>
                          )}
                        </div>
                      )}
                      {claim.rejection_reason && (
                        <p className="text-red-600 mt-1">Reason: {claim.rejection_reason}</p>
                      )}
                      {/* Chain data hints for failed auto-verify */}
                      {isPending && claim.chain_data && (() => {
                        const cd = claim.chain_data as any;
                        // Surface any diagnostic info — ensure it's a string
                        const raw = cd.error
                          || (typeof cd.result === "string" ? cd.result : null)
                          || (typeof cd.message === "string" ? cd.message : null)
                          || (typeof cd.detail === "string" ? cd.detail : null);
                        const hint = typeof raw === "string" ? raw
                          : raw ? JSON.stringify(raw) : null;
                        return hint ? (
                          <p className="text-amber-600 mt-1">Auto-verify note: {hint}</p>
                        ) : null;
                      })()}
                      {isPending && claim.chain_data && (claim.chain_data as any).amount != null && (
                        <p className="text-blue-600 mt-1">
                          On-chain amount detected: ${Number((claim.chain_data as any).amount).toLocaleString()}
                        </p>
                      )}
                    </div>

                    {/* Approve / Reject buttons with amount input for wire */}
                    {isPending && canWrite && (() => {
                      // Wire approval needs an amount input field
                      const claimApproveId = `approve-amt-${claim.id}`;

                      const handleApprove = async () => {
                        // For wire: read amount from input; for crypto: use full claimed amount
                        let approvedAmount: number | undefined;
                        if (isWire) {
                          const input = document.getElementById(claimApproveId) as HTMLInputElement;
                          const val = parseFloat(input?.value || "");
                          if (!val || val <= 0) {
                            toast.error("Enter the wire amount received");
                            return;
                          }
                          approvedAmount = val;
                        }

                        const payload: Record<string, any> = { claim_id: claim.id, action: "approve" };
                        if (approvedAmount != null) payload.approved_amount = approvedAmount;

                        const res = await fetch("/api/admin/payments/claims", {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify(payload),
                        });
                        if (res.ok) {
                          const d = await res.json();
                          toast.success(`Payment approved — $${(d.amount_applied || approvedAmount || claim.amount_usd).toLocaleString()} applied`);
                          fetchData();
                        } else {
                          const d = await res.json();
                          toast.error(d.error || "Failed");
                        }
                      };

                      return (
                        <div className="pt-2 border-t border-gray-200 space-y-2">
                          {isWire && (
                            <div className="flex items-center gap-2">
                              <label className="text-xs text-gray-500 shrink-0">Amount received:</label>
                              <div className="relative flex-1 max-w-[180px]">
                                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                                <input
                                  id={claimApproveId}
                                  type="number"
                                  step="0.01"
                                  defaultValue={Number(claim.amount_usd)}
                                  className="w-full pl-6 pr-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-kayan-500"
                                />
                              </div>
                              <span className="text-[10px] text-gray-400">of ${Number(claim.amount_usd).toLocaleString()} claimed</span>
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            <Button size="sm" onClick={handleApprove}>
                              ✓ {isWire ? "Approve Wire" : "Approve Payment"}
                            </Button>
                            {/* Re-check: re-run on-chain verification for crypto claims */}
                            {claim.tx_hash && (
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={async () => {
                                  const res = await fetch("/api/admin/payments/claims", {
                                    method: "PATCH",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ claim_id: claim.id, action: "recheck" }),
                                  });
                                  const d = await res.json();
                                  if (d.verified) {
                                    toast.success(`Verified! $${(d.amount_applied || 0).toLocaleString()} applied`);
                                  } else {
                                    toast.info(d.detail || "Still not confirmed on-chain");
                                  }
                                  fetchData();
                                }}
                              >
                                ↻ Re-check
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={async () => {
                                const reason = prompt("Rejection reason (optional):");
                                const res = await fetch("/api/admin/payments/claims", {
                                  method: "PATCH",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ claim_id: claim.id, action: "reject", rejection_reason: reason }),
                                });
                                if (res.ok) { toast.success("Payment claim rejected"); fetchData(); }
                                else { const d = await res.json(); toast.error(d.error || "Failed"); }
                              }}
                              className="text-red-600 hover:text-red-800"
                            >
                              ✗ Reject
                            </Button>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })()}

      {/* ── Emails (continued) ── */}
      <Card>
        <CardHeader title="Emails" subtitle="Sent emails and manual triggers" />
        <div className="flex gap-2 mb-4 flex-wrap">
          <Button variant="secondary" size="sm" onClick={() => handleSendEmail("welcome")}>Resend Welcome</Button>
          {canWrite && !investor.docs_sent_at && (
            <Button variant="secondary" size="sm" onClick={handleSendDocs}>Mark Docs Sent</Button>
          )}
        </div>
        {investor.docs_sent_at && (
          <p className="text-xs text-gray-400 mb-3">Subscription docs sent: {new Date(investor.docs_sent_at).toLocaleDateString()}</p>
        )}
        {investor.email_events && investor.email_events.length > 0 ? (
          <div className="space-y-2">
            {investor.email_events.map(ev => (
              <div key={ev.id} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg text-sm">
                <div className="flex items-center gap-3">
                  <span className={`inline-block w-2 h-2 rounded-full ${ev.metadata?.sent_successfully ? "bg-emerald-400" : "bg-amber-400"}`} />
                  <span className="font-medium text-gray-700 capitalize">{ev.email_type.replace(/_/g, " ")}</span>
                  {ev.metadata?.trigger && <span className="text-xs text-gray-400">({ev.metadata.trigger})</span>}
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
