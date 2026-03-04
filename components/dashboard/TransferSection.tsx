"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { AllocationWithRound } from "@/lib/types";
import { formatTokenAmount } from "@/lib/vesting";
import { toast } from "sonner";

// ── Types ──

interface TransferRecord {
  id: string;
  token_amount: number;
  transfer_type: string;
  status: string;
  direction: string;
  tx_hash: string | null;
  reason: string | null;
  created_at: string;
  from_inv?: { full_name: string; email: string };
  to_inv?: { full_name: string; email: string };
  saft_rounds?: { name: string };
}

const STATUS_COLORS: Record<string, string> = {
  requested: "bg-blue-100 text-blue-700",
  under_review: "bg-amber-100 text-amber-700",
  approved: "bg-emerald-100 text-emerald-700",
  completed: "bg-emerald-100 text-emerald-800",
  rejected: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-500",
};

const inputCls = "w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500";

// ── Props ──

interface TransferSectionProps {
  allocations: AllocationWithRound[];
  kycStatus: string;
  pqStatus: string;
  ticker: string;
}

// ═══════════════════════════════════════════════════════════
// REQUEST MODAL
// ═══════════════════════════════════════════════════════════

function TransferRequestModal({ allocations, ticker, onClose, onSaved }: {
  allocations: AllocationWithRound[]; ticker: string; onClose: () => void; onSaved: () => void;
}) {
  const [allocId, setAllocId] = useState("");
  const [amount, setAmount] = useState("");
  const [transferType, setTransferType] = useState("sale");
  const [reason, setReason] = useState("");
  const [price, setPrice] = useState("");
  const [toEmail, setToEmail] = useState("");
  const [toName, setToName] = useState("");
  const [toWallet, setToWallet] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [saving, setSaving] = useState(false);

  const selectedAlloc = allocations.find((a) => a.id === allocId);
  const maxAmount = selectedAlloc ? Number(selectedAlloc.token_amount) : 0;

  const handleSubmit = async () => {
    if (!allocId || !amount || !transferType || !acknowledged) {
      toast.error("Please fill all required fields and acknowledge the terms");
      return;
    }
    if (Number(amount) > maxAmount) {
      toast.error(`Maximum transferable: ${formatTokenAmount(maxAmount)} ${ticker}`);
      return;
    }

    setSaving(true);
    const res = await fetch("/api/investor/transfers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        allocation_id: allocId,
        token_amount: Number(amount),
        transfer_type: transferType,
        reason,
        price_per_token: price ? Number(price) : undefined,
        transferee_email: toEmail || undefined,
        transferee_name: toName || undefined,
        to_wallet: toWallet || undefined,
      }),
    });
    setSaving(false);

    if (res.ok) {
      toast.success("Transfer consent request submitted");
      onSaved();
      onClose();
    } else {
      const err = await res.json();
      toast.error(err.error || "Failed to submit request");
    }
  };

  // Only show eligible allocations (paid/grant, approved, balance > 0)
  const eligible = allocations.filter(
    (a) => a.approval_status === "approved" && ["paid", "grant"].includes(a.payment_status) && Number(a.token_amount) > 0
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Request Transfer Consent</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <p className="text-xs text-gray-500">
          Submit a request for the Company to approve your token transfer. All transfers require prior written consent.
        </p>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Allocation</label>
          <select value={allocId} onChange={(e) => setAllocId(e.target.value)} className={inputCls}>
            <option value="">Select allocation…</option>
            {eligible.map((a) => (
              <option key={a.id} value={a.id}>
                {a.saft_rounds.name} · {formatTokenAmount(Number(a.token_amount))} {ticker}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Amount to Transfer</label>
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} max={maxAmount} placeholder="0" className={inputCls} />
            {maxAmount > 0 && <p className="text-[10px] text-gray-400 mt-0.5">Max: {formatTokenAmount(maxAmount)}</p>}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
            <select value={transferType} onChange={(e) => setTransferType(e.target.value)} className={inputCls}>
              <option value="sale">Sale</option>
              <option value="gift">Gift</option>
              <option value="estate">Estate</option>
              <option value="corporate_restructure">Corporate Restructure</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Reason</label>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Why are you transferring these tokens?" className={inputCls} />
        </div>

        {transferType === "sale" && (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Price per Token (optional)</label>
            <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} step="0.01" placeholder="0.00" className={inputCls} />
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Transferee Email</label>
            <input type="email" value={toEmail} onChange={(e) => setToEmail(e.target.value)} placeholder="optional" className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Transferee Name</label>
            <input type="text" value={toName} onChange={(e) => setToName(e.target.value)} placeholder="optional" className={inputCls} />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Transferee Wallet (optional)</label>
          <input type="text" value={toWallet} onChange={(e) => setToWallet(e.target.value)} placeholder="0x..." className={`${inputCls} font-mono text-xs`} />
        </div>

        <label className="flex items-start gap-2 cursor-pointer">
          <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-600" />
          <span className="text-xs text-gray-600 leading-relaxed">
            I understand this transfer requires Company approval, the transferee must complete the same qualification process, and
            the transfer must comply with applicable securities laws including Regulation S.
          </span>
        </label>

        <div className="flex items-center gap-2 pt-2">
          <Button onClick={handleSubmit} loading={saving} disabled={!acknowledged}>Submit Request</Button>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MAIN SECTION
// ═══════════════════════════════════════════════════════════

export function TransferSection({ allocations, kycStatus, pqStatus, ticker }: TransferSectionProps) {
  const [history, setHistory] = useState<{ sent: TransferRecord[]; received: TransferRecord[] }>({ sent: [], received: [] });
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchHistory = () => {
    setLoading(true);
    fetch("/api/investor/transfers")
      .then((r) => r.json())
      .then((data) => setHistory({ sent: data.sent || [], received: data.received || [] }))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchHistory(); }, []);

  const canTransfer = kycStatus === "verified" && pqStatus === "approved" &&
    allocations.some((a) => a.approval_status === "approved" && ["paid", "grant"].includes(a.payment_status) && Number(a.token_amount) > 0);

  const allTransfers = [...history.sent, ...history.received].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  // Don't render if no transfers and can't transfer
  if (!canTransfer && allTransfers.length === 0 && !loading) return null;

  return (
    <>
      <Card>
        <div className="flex items-center justify-between mb-4">
          <CardHeader title="Token Transfers" subtitle="Request consent or view transfer history" />
          {canTransfer && (
            <Button size="sm" variant="secondary" onClick={() => setShowModal(true)} className="text-xs">
              Request Transfer
            </Button>
          )}
        </div>

        {loading ? (
          <p className="text-xs text-gray-400 py-4 text-center">Loading…</p>
        ) : allTransfers.length === 0 ? (
          <p className="text-xs text-gray-400 py-4 text-center">No transfers yet</p>
        ) : (
          <div className="overflow-x-auto -mx-5 px-5">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="py-2 px-2 text-left text-gray-500 font-medium">Date</th>
                  <th className="py-2 px-2 text-left text-gray-500 font-medium">Direction</th>
                  <th className="py-2 px-2 text-left text-gray-500 font-medium">Counterparty</th>
                  <th className="py-2 px-2 text-right text-gray-500 font-medium">Tokens</th>
                  <th className="py-2 px-2 text-left text-gray-500 font-medium">Round</th>
                  <th className="py-2 px-2 text-center text-gray-500 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {allTransfers.map((t) => {
                  const isSent = history.sent.some((s) => s.id === t.id);
                  return (
                    <tr key={t.id} className="border-b border-gray-50">
                      <td className="py-2 px-2 text-gray-500">{new Date(t.created_at).toLocaleDateString()}</td>
                      <td className="py-2 px-2">
                        <span className={`text-[10px] font-medium ${isSent ? "text-red-600" : "text-emerald-600"}`}>
                          {isSent ? "Sent" : "Received"}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-gray-700">
                        {isSent ? (t.to_inv?.full_name || "Pending") : (t.from_inv?.full_name || "—")}
                      </td>
                      <td className="py-2 px-2 text-right font-medium text-gray-900">{formatTokenAmount(Number(t.token_amount))}</td>
                      <td className="py-2 px-2 text-gray-600">{t.saft_rounds?.name || "—"}</td>
                      <td className="py-2 px-2 text-center">
                        <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${STATUS_COLORS[t.status] || "bg-gray-100 text-gray-500"}`}>
                          {t.status.replace("_", " ")}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {showModal && (
        <TransferRequestModal
          allocations={allocations}
          ticker={ticker}
          onClose={() => setShowModal(false)}
          onSaved={fetchHistory}
        />
      )}
    </>
  );
}
