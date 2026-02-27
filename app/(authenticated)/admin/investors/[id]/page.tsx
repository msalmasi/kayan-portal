"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { KycBadge, PaymentBadge, PqBadge } from "@/components/ui/Badge";
import { PqReviewChecklist } from "@/components/admin/PqReviewChecklist";
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
        toast.success("PQ approved — capital call email sent automatically");
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
    if (res.ok) { toast.success("Allocation added"); setNewRoundId(""); setNewTokenAmount(""); fetchData(); }
    else { const err = await res.json(); toast.error(err.error || "Failed"); }
  };

  const handleRemoveAllocation = async (id: string) => {
    if (!confirm("Remove this allocation?")) return;
    const res = await fetch(`/api/admin/allocations?id=${id}`, { method: "DELETE" });
    if (res.ok) { toast.success("Removed"); fetchData(); } else toast.error("Failed");
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

  const totalDue = investor.allocations.reduce((s, a) => s + Number(a.amount_usd || 0), 0);
  const totalReceived = investor.allocations.reduce((s, a) => s + Number(a.amount_received_usd || 0), 0);
  const allPaid = investor.allocations.length > 0 && investor.allocations.every(a => a.payment_status === "paid");

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
                {allPaid ? <span className="text-emerald-700">Fully Paid</span>
                  : investor.allocations.some(a => a.payment_status === "partial") ? <span className="text-amber-700">Partial</span>
                  : <span className="text-gray-500">Awaiting</span>}
              </p>
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
                return (
                  <tr key={alloc.id} className="border-b border-gray-50 last:border-0">
                    <td className="py-3 px-2 font-medium">{alloc.saft_rounds.name}</td>
                    <td className="py-3 px-2 text-right">{formatTokenAmount(Number(alloc.token_amount))}</td>
                    <td className="py-3 px-2 text-right">{due > 0 ? `$${due.toLocaleString()}` : "—"}</td>
                    <td className="py-3 px-2 text-center"><PaymentBadge status={alloc.payment_status} /></td>
                    <td className="py-3 px-2 text-center text-xs text-gray-500">{alloc.payment_method ? PAYMENT_METHOD_LABELS[alloc.payment_method] : "—"}</td>
                    <td className="py-3 px-2 text-right">{alloc.amount_received_usd ? `$${Number(alloc.amount_received_usd).toLocaleString()}` : "—"}</td>
                    <td className="py-3 px-2 text-right space-x-2">
                      {canWrite && !isEditing && (
                        <button onClick={() => { setEditingPayment(alloc.id); setPaymentForm({ payment_status: alloc.payment_status, payment_method: alloc.payment_method || "", amount_received_usd: alloc.amount_received_usd ? String(alloc.amount_received_usd) : "", tx_reference: alloc.tx_reference || "" }); }} className="text-kayan-500 hover:text-kayan-700 text-xs font-medium">Edit</button>
                      )}
                      {canWrite && <button onClick={() => handleRemoveAllocation(alloc.id)} className="text-red-500 hover:text-red-700 text-xs font-medium">Remove</button>}
                    </td>
                  </tr>
                );
              })}
              {investor.allocations.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-gray-400">No allocations</td></tr>}
            </tbody>
          </table>
        </div>

        {/* Payment edit form */}
        {editingPayment && canWrite && (
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

        {/* Add allocation */}
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

      {/* ── Capital Call Status ── */}
      {(() => {
        // Derive capital call gate status from loaded data
        const pqApproved = investor.pq_status === "approved";
        const hasAllocations = investor.allocations.length > 0;
        const saftSigned = investor.investor_documents?.some(
          (d) => d.doc_type === "saft" && d.status === "signed"
        );
        const capitalCallSent = investor.email_events?.some(
          (e: EmailEvent) => e.email_type === "capital_call"
        );
        const allReady = pqApproved && hasAllocations && saftSigned;

        return (
          <Card>
            <CardHeader title="Capital Call" subtitle="Auto-sends when all conditions are met" />
            {capitalCallSent ? (
              <div className="flex items-center gap-2 bg-emerald-50 rounded-lg p-3 text-sm text-emerald-700">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-400" />
                <span className="font-medium">Capital call sent</span>
                <span className="text-emerald-500 text-xs ml-auto">
                  {investor.email_events?.find((e: EmailEvent) => e.email_type === "capital_call")?.sent_at
                    ? new Date(investor.email_events.find((e: EmailEvent) => e.email_type === "capital_call")!.sent_at).toLocaleString()
                    : ""}
                </span>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-3 text-sm">
                  <span className={`inline-block w-2 h-2 rounded-full ${hasAllocations ? "bg-emerald-400" : "bg-gray-300"}`} />
                  <span className={hasAllocations ? "text-gray-700" : "text-gray-400"}>
                    Allocation assigned {hasAllocations ? "✓" : "— waiting"}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className={`inline-block w-2 h-2 rounded-full ${pqApproved ? "bg-emerald-400" : "bg-gray-300"}`} />
                  <span className={pqApproved ? "text-gray-700" : "text-gray-400"}>
                    PQ approved {pqApproved ? "✓" : "— waiting"}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className={`inline-block w-2 h-2 rounded-full ${saftSigned ? "bg-emerald-400" : "bg-gray-300"}`} />
                  <span className={saftSigned ? "text-gray-700" : "text-gray-400"}>
                    SAFT signed {saftSigned ? "✓" : "— waiting"}
                  </span>
                </div>
                {allReady && !capitalCallSent && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <p className="text-xs text-amber-600 mb-2">All conditions met but no capital call found. You can trigger one manually:</p>
                    <Button variant="secondary" size="sm" onClick={() => handleSendEmail("capital_call")}>
                      Send Capital Call
                    </Button>
                  </div>
                )}
              </div>
            )}
          </Card>
        );
      })()}

      {/* ── Emails ── */}
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
