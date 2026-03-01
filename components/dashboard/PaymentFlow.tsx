"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { toast } from "sonner";

// ─── Types ──────────────────────────────────────────────────

interface RoundBalance {
  round_id: string;
  round_name: string;
  token_price: number;
  total_tokens: number;
  total_due: number;
  total_received: number;
  balance_due: number;
}

interface PaymentClaim {
  id: string;
  round_id: string;
  method: string;
  amount_usd: number;
  status: string;
  tx_hash: string | null;
  wire_reference: string | null;
  chain_data: Record<string, any>;
  created_at: string;
}

// ─── Payment method config (loaded from API) ───────────────

interface MethodOption {
  id: string;
  label: string;
  sublabel: string;
  enabled: boolean;
  icon: string;
}

type Step = "overview" | "method" | "pay" | "submitted";

// ─── Status badge ───────────────────────────────────────────

function ClaimStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending:   "bg-amber-100 text-amber-700",
    verifying: "bg-blue-100 text-blue-700",
    verified:  "bg-emerald-100 text-emerald-700",
    rejected:  "bg-red-100 text-red-700",
    failed:    "bg-red-100 text-red-700",
  };
  const labels: Record<string, string> = {
    pending:   "Pending Review",
    verifying: "Verifying…",
    verified:  "Verified ✓",
    rejected:  "Rejected",
    failed:    "Failed",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${styles[status] || "bg-gray-100 text-gray-600"}`}>
      {labels[status] || status}
    </span>
  );
}

// ─── Helpers ────────────────────────────────────────────────

const METHOD_LABELS: Record<string, string> = {
  usdc_eth: "USDC (ERC-20)", usdt_eth: "USDT (ERC-20)", usdc_sol: "USDC (SPL)",
  wire: "Wire Transfer",
};
const CHAIN_LABELS: Record<string, string> = {
  usdc_eth: "Ethereum", usdt_eth: "Ethereum", usdc_sol: "Solana",
};

function getExplorerUrl(method: string, hash: string): string {
  if (method === "usdc_eth" || method === "usdt_eth")
    return `https://etherscan.io/tx/${hash}`;
  if (method === "usdc_sol") return `https://solscan.io/tx/${hash}`;
  return "";
}

// ─── Main Component ─────────────────────────────────────────

export function PaymentFlow() {
  const [loading, setLoading] = useState(true);
  const [rounds, setRounds] = useState<RoundBalance[]>([]);
  const [grants, setGrants] = useState<{ round_id: string; round_name: string; total_tokens: number }[]>([]);
  const [claims, setClaims] = useState<PaymentClaim[]>([]);
  const [methods, setMethods] = useState<MethodOption[]>([]);
  const [wallets, setWallets] = useState<{ ethereum: string; solana: string }>({ ethereum: "", solana: "" });
  const [wireInstructions, setWireInstructions] = useState<Record<string, string> | null>(null);

  // Flow state
  const [step, setStep] = useState<Step>("overview");
  const [selectedRound, setSelectedRound] = useState<RoundBalance | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);

  // Form
  const [txHash, setTxHash] = useState("");
  const [fromWallet, setFromWallet] = useState("");
  const [wireRef, setWireRef] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ verified: boolean; detail: string } | null>(null);
  const [copied, setCopied] = useState("");

  // ── Helper: get wallet address for a method from loaded state ──
  const getWalletAddress = (method: string): string => {
    if (method === "usdc_eth" || method === "usdt_eth") return wallets.ethereum;
    if (method === "usdc_sol") return wallets.solana;
    return "";
  };

  // ── Fetch ──
  const fetchData = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/investor/payments");
    if (res.ok) {
      const data = await res.json();
      setRounds(data.rounds || []);
      setGrants(data.grants || []);
      setClaims(data.claims || []);
      if (data.methods) setMethods(data.methods);
      if (data.wallets) setWallets(data.wallets);
      if (data.wire_instructions) setWireInstructions(data.wire_instructions);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const resetFlow = () => {
    setStep("overview"); setSelectedRound(null); setSelectedMethod(null);
    setTxHash(""); setFromWallet(""); setWireRef(""); setResult(null);
  };

  // ── Submit ──
  const handleSubmit = async () => {
    if (!selectedRound || !selectedMethod) return;
    setSubmitting(true); setResult(null);

    const body: Record<string, any> = {
      round_id: selectedRound.round_id,
      method: selectedMethod,
      // Crypto: balance_due as reference — backend uses actual on-chain amount
      // Wire: balance_due as claimed — admin confirms actual amount received
      amount_usd: selectedRound.balance_due,
    };
    if (selectedMethod === "wire") body.wire_reference = wireRef;
    else { body.tx_hash = txHash; if (fromWallet) body.from_wallet = fromWallet; }

    const res = await fetch("/api/investor/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setSubmitting(false);

    if (!res.ok) {
      setResult({ verified: false, detail: data.error || "Submission failed" });
      return;
    }

    setResult(data.verification || { verified: false, detail: "Submitted for manual review by our team." });
    setStep("submitted");
    fetchData();
  };

  // ── Copy helper ──
  const handleCopy = (text: string, label?: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label || text);
    setTimeout(() => setCopied(""), 2000);
  };

  // Nothing due
  if (!loading && rounds.length === 0 && grants.length === 0 && claims.length === 0) return null;
  if (loading) return <Card><CardHeader title="Payments" /><p className="text-sm text-gray-400">Loading…</p></Card>;

  const inputCls = "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-kayan-500";

  return (
    <Card>
      <div id="payments" className="scroll-mt-24" />
      <CardHeader
        title="Payments"
        subtitle={step === "overview" ? "Allocations, balances, and payment history" : undefined}
      />

      {/* ── OVERVIEW ── */}
      {step === "overview" && (
        <div className="space-y-4">
          {rounds.map((r) => {
            return (
              <div key={r.round_id} className="border border-amber-200 bg-amber-50/50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{r.round_name}</p>
                    <p className="text-xs text-gray-500">
                      {r.total_tokens.toLocaleString()} tokens · ${r.total_due.toLocaleString()} total
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-amber-800">${r.balance_due.toLocaleString()}</p>
                    <p className="text-[10px] uppercase tracking-wide text-amber-600 font-medium">Balance Due</p>
                  </div>
                </div>

                {r.total_received > 0 && (
                  <div className="mb-3">
                    <div className="w-full bg-gray-200 rounded-full h-1.5">
                      <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${Math.min(100, (r.total_received / r.total_due) * 100)}%` }} />
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">${r.total_received.toLocaleString()} received</p>
                  </div>
                )}

                {/* Show pending claims as info, but always allow new payments */}
                {(() => {
                  const roundClaims = claims.filter(
                    (c) => c.round_id === r.round_id && (c.status === "pending" || c.status === "verifying")
                  );
                  return (
                    <div className="space-y-2">
                      {roundClaims.length > 0 && (
                        <div className="text-xs text-amber-700 bg-amber-100 rounded-lg px-3 py-2 space-y-2">
                          {roundClaims.map((c) => (
                            <div key={c.id} className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="flex-1">
                                  {c.method === "wire"
                                    ? `Wire payment of $${Number(c.amount_usd).toLocaleString()} submitted`
                                    : "Crypto payment submitted — awaiting verification"}
                                </span>
                                <ClaimStatusBadge status={c.status} />
                              </div>
                              <div className="flex items-center gap-2">
                                {/* Re-check: crypto only */}
                                {c.tx_hash && (
                                  <button
                                    onClick={async () => {
                                      const res = await fetch("/api/investor/payments", {
                                        method: "PATCH",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({ claim_id: c.id }),
                                      });
                                      const d = await res.json();
                                      if (d.verified) {
                                        toast.success(`Verified! $${(d.amount_applied || 0).toLocaleString()} applied`);
                                      } else {
                                        toast.info(d.detail || "Still not confirmed on-chain");
                                      }
                                      fetchData();
                                    }}
                                    className="text-[11px] font-medium text-blue-700 hover:text-blue-900 underline"
                                  >
                                    ↻ Re-check
                                  </button>
                                )}
                                {/* Delete */}
                                <button
                                  onClick={async () => {
                                    if (!confirm("Remove this payment claim? This cannot be undone.")) return;
                                    const res = await fetch("/api/investor/payments", {
                                      method: "DELETE",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ claim_id: c.id }),
                                    });
                                    if (res.ok) { toast.success("Payment claim removed"); fetchData(); }
                                    else { const d = await res.json(); toast.error(d.error || "Failed"); }
                                  }}
                                  className="text-[11px] font-medium text-red-600 hover:text-red-800 underline"
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      <Button size="sm" onClick={() => { setSelectedRound(r); setStep("method"); }}>
                        {roundClaims.length > 0 ? "Make Another Payment" : "Make Payment"}
                      </Button>
                    </div>
                  );
                })()}
              </div>
            );
          })}

          {/* ── Grant allocations (no payment needed) ── */}
          {grants.map((g) => (
            <div
              key={`grant-${g.round_id}`}
              className="border border-emerald-200 bg-emerald-50/30 rounded-xl px-5 py-4 flex items-center justify-between"
            >
              <div>
                <p className="text-sm font-semibold text-gray-900">{g.round_name}</p>
                <p className="text-xs text-emerald-600 mt-0.5">Grant — no payment required</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-emerald-700">{g.total_tokens.toLocaleString()} tokens</p>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-700">
                  ✓ Granted
                </span>
              </div>
            </div>
          ))}

          {rounds.length === 0 && grants.length === 0 && claims.length > 0 && (
            <p className="text-sm text-emerald-600 font-medium">All balances settled. Thank you!</p>
          )}

          {claims.length > 0 && (
            <div className="border-t border-gray-100 pt-4">
              <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Payment History</h4>
              <div className="space-y-2">
                {claims.map((c) => {
                  const isActionable = c.status !== "verified";
                  return (
                    <div key={c.id} className={`py-2 px-3 rounded-lg text-sm ${isActionable ? "bg-amber-50/50" : "bg-gray-50"}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-xs text-gray-400">{METHOD_LABELS[c.method] || c.method}</span>
                          <span className="text-xs text-gray-500 font-mono truncate max-w-[160px]">
                            {c.tx_hash ? `${c.tx_hash.slice(0, 10)}…${c.tx_hash.slice(-6)}` : c.wire_reference || "—"}
                          </span>
                          <span className="text-xs text-gray-400">
                            {c.status === "verified"
                              ? `$${Number((c as any).amount_verified_usd ?? c.amount_usd).toLocaleString()}`
                              : c.method === "wire"
                                ? `$${c.amount_usd.toLocaleString()}`
                                : "pending"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <ClaimStatusBadge status={c.status} />
                          <span className="text-xs text-gray-400">{new Date(c.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                      {/* Actions for unverified claims */}
                      {isActionable && (
                        <div className="flex items-center gap-3 mt-1.5 pt-1.5 border-t border-gray-100">
                          {c.tx_hash && (
                            <button
                              onClick={async () => {
                                const res = await fetch("/api/investor/payments", {
                                  method: "PATCH",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ claim_id: c.id }),
                                });
                                const d = await res.json();
                                if (d.verified) toast.success(`Verified! $${(d.amount_applied || 0).toLocaleString()} applied`);
                                else toast.info(d.detail || "Still not confirmed");
                                fetchData();
                              }}
                              className="text-[11px] font-medium text-blue-600 hover:text-blue-800"
                            >
                              ↻ Re-check on-chain
                            </button>
                          )}
                          <button
                            onClick={async () => {
                              if (!confirm("Remove this payment claim?")) return;
                              const res = await fetch("/api/investor/payments", {
                                method: "DELETE",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ claim_id: c.id }),
                              });
                              if (res.ok) { toast.success("Claim removed"); fetchData(); }
                              else { const d = await res.json(); toast.error(d.error || "Failed"); }
                            }}
                            className="text-[11px] font-medium text-red-500 hover:text-red-700"
                          >
                            Remove
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── METHOD SELECTION ── */}
      {step === "method" && selectedRound && (
        <div className="space-y-4">
          <div className="bg-gray-50 rounded-lg p-4 text-center">
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              Payment for {selectedRound.round_name}
            </p>
            <p className="text-3xl font-bold text-gray-900 mt-1">
              ${selectedRound.balance_due.toLocaleString()}
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700">Select payment method</p>
            {methods.map((m) => (
              <button
                key={m.id}
                disabled={!m.enabled}
                onClick={() => {
                  setSelectedMethod(m.id);
                  setStep("pay");
                }}
                className={`w-full flex items-center gap-4 p-4 rounded-lg border text-left transition-colors ${
                  m.enabled
                    ? "border-gray-200 hover:border-kayan-400 hover:bg-kayan-50/30 cursor-pointer"
                    : "border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed"
                }`}
              >
                <span className="text-xl w-8 text-center shrink-0">{m.icon}</span>
                <div className="flex-1">
                  <p className={`text-sm font-medium ${m.enabled ? "text-gray-900" : "text-gray-400"}`}>{m.label}</p>
                  <p className="text-xs text-gray-400">{m.sublabel}</p>
                </div>
                {m.enabled && (
                  <svg className="w-5 h-5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                )}
              </button>
            ))}
          </div>

          <Button variant="ghost" size="sm" onClick={resetFlow}>← Back</Button>
        </div>
      )}

      {/* ── PAY: CRYPTO ── */}
      {step === "pay" && selectedRound && selectedMethod && selectedMethod !== "wire" && selectedMethod !== "credit_card" && (
        <div className="space-y-5">
          {/* Summary */}
          <div className="bg-gray-50 rounded-lg p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500">{selectedRound.round_name}</p>
              <p className="text-sm font-medium text-gray-700">
                {METHOD_LABELS[selectedMethod]} on {CHAIN_LABELS[selectedMethod]}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xl font-bold text-gray-900">${selectedRound.balance_due.toLocaleString()}</p>
              <p className="text-[10px] text-gray-400">balance due</p>
            </div>
          </div>

          {/* Wallet + instructions */}
          <div className="border border-kayan-200 bg-kayan-50/30 rounded-lg p-4 space-y-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                Send to this {CHAIN_LABELS[selectedMethod]} wallet:
              </label>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-mono text-gray-800 break-all select-all">
                  {getWalletAddress(selectedMethod) || "Wallet not configured — contact support"}
                </code>
                {getWalletAddress(selectedMethod) && (
                  <button
                    onClick={() => handleCopy(getWalletAddress(selectedMethod), "wallet")}
                    className="shrink-0 px-3 py-2.5 text-xs font-medium text-kayan-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
                  >
                    {copied === "wallet" ? "Copied ✓" : "Copy"}
                  </button>
                )}
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700 space-y-1">
              <p className="font-medium">⚠ Important</p>
              <ul className="list-disc list-inside space-y-0.5 text-amber-600">
                <li>Send <strong>only {METHOD_LABELS[selectedMethod]}</strong> to this address</li>
                <li>Sending the wrong token or network will result in permanent loss</li>
                <li>Partial payments are accepted — you can pay in multiple transactions</li>
              </ul>
            </div>
          </div>

          {/* Tx hash input */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-gray-700">
              After sending, paste your transaction details below
            </p>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Transaction Hash / Signature *</label>
              <input
                type="text"
                value={txHash}
                onChange={(e) => setTxHash(e.target.value.trim())}
                placeholder={selectedMethod === "usdc_sol" ? "e.g. 5xYz…abc (Solana signature)" : "e.g. 0xabc…123"}
                className={`${inputCls} font-mono text-xs`}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                Your Wallet Address <span className="text-gray-300">(optional)</span>
              </label>
              <input
                type="text"
                value={fromWallet}
                onChange={(e) => setFromWallet(e.target.value.trim())}
                placeholder="The wallet you sent from"
                className={`${inputCls} font-mono text-xs`}
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={handleSubmit} disabled={!txHash || submitting} loading={submitting}>
              {submitting ? "Verifying on-chain…" : "Submit & Verify"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setStep("method")}>← Back</Button>
          </div>

          <p className="text-xs text-gray-400">
            We automatically verify your transaction on the {CHAIN_LABELS[selectedMethod]} blockchain.
            If auto-verification fails, it will be reviewed manually.
          </p>
        </div>
      )}

      {/* ── PAY: WIRE TRANSFER ── */}
      {step === "pay" && selectedMethod === "wire" && selectedRound && (() => {
        const wi = wireInstructions;
        const hasInstructions = wi && (wi.bank_name || wi.account_number);

        /** Render a single copiable instruction row */
        const InstructionRow = ({ label, value, copyKey }: { label: string; value: string; copyKey: string }) => (
          <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
            <div>
              <p className="text-[11px] text-gray-400 uppercase tracking-wide">{label}</p>
              <p className="text-sm font-mono text-gray-800 mt-0.5 select-all">{value || "—"}</p>
            </div>
            {value && (
              <button
                onClick={() => handleCopy(value, copyKey)}
                className="text-[10px] font-medium text-kayan-600 hover:text-kayan-800 px-2 py-1 rounded bg-gray-50 hover:bg-gray-100"
              >
                {copied === copyKey ? "✓" : "Copy"}
              </button>
            )}
          </div>
        );

        return (
          <div className="space-y-5">
            {/* Summary */}
            <div className="bg-gray-50 rounded-lg p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">{selectedRound.round_name}</p>
                <p className="text-sm font-medium text-gray-700">Wire Transfer (USD)</p>
              </div>
              <p className="text-xl font-bold text-gray-900">${selectedRound.balance_due.toLocaleString()}</p>
            </div>

            {/* Wire instructions */}
            {hasInstructions ? (
              <div className="border border-kayan-200 bg-kayan-50/30 rounded-lg p-4 space-y-1">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2 h-2 rounded-full bg-kayan-500" />
                  <p className="text-sm font-medium text-kayan-800">Wire Transfer Instructions</p>
                </div>
                <InstructionRow label="Bank Name" value={wi.bank_name} copyKey="bank" />
                <InstructionRow label="Account Name" value={wi.account_name} copyKey="acct_name" />
                <InstructionRow label="Account Number" value={wi.account_number} copyKey="acct_num" />
                <InstructionRow label="Routing Number" value={wi.routing_number} copyKey="routing" />
                {wi.swift_code && (
                  <InstructionRow label="SWIFT / BIC" value={wi.swift_code} copyKey="swift" />
                )}
                <div className="pt-2">
                  <p className="text-[11px] text-gray-400 uppercase tracking-wide">Reference / Memo</p>
                  <p className="text-sm text-gray-800 mt-0.5 font-medium">{wi.reference_note}</p>
                </div>
              </div>
            ) : (
              <div className="border border-gray-200 bg-gray-50 rounded-lg p-4 space-y-2">
                <p className="text-sm font-medium text-gray-700">Wire Transfer Instructions</p>
                <p className="text-xs text-gray-500">
                  Wire instructions have not been configured yet. Contact{" "}
                  <a href="mailto:support@kayanforest.com" className="text-kayan-600 underline">
                    support@kayanforest.com
                  </a>{" "}
                  to arrange a wire transfer.
                </p>
              </div>
            )}

            {/* Important notes */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700 space-y-1">
              <p className="font-medium">⚠ Important</p>
              <ul className="list-disc list-inside space-y-0.5 text-amber-600">
                <li>Balance due: <strong>${selectedRound.balance_due.toLocaleString()} USD</strong></li>
                <li>Partial payments accepted — you can send multiple wires</li>
                <li>Include your name and &quot;Kayan Token&quot; in the wire reference</li>
                <li>Processing typically takes 2–5 business days</li>
              </ul>
            </div>

            {/* Wire reference input */}
            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-700">
                Already sent the wire? Enter your reference below.
              </p>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Wire Reference / Confirmation Number *</label>
                <input
                  type="text"
                  value={wireRef}
                  onChange={(e) => setWireRef(e.target.value)}
                  placeholder="e.g. FED20260228ABC123"
                  className={inputCls}
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button onClick={handleSubmit} disabled={!wireRef || submitting} loading={submitting}>
                Submit Wire Confirmation
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setStep("method")}>← Back</Button>
            </div>

            <p className="text-xs text-gray-400">
              Our team will manually verify your wire transfer and confirm your allocation once funds are received.
            </p>
          </div>
        );
      })()}

      {/* ── SUBMITTED ── */}
      {step === "submitted" && result && (
        <div className="space-y-4">
          <div className={`rounded-lg p-6 text-center ${
            result.verified ? "bg-emerald-50 border border-emerald-200" : "bg-amber-50 border border-amber-200"
          }`}>
            <div className={`w-14 h-14 rounded-full mx-auto mb-3 flex items-center justify-center text-2xl ${
              result.verified ? "bg-emerald-100 text-emerald-600" : "bg-amber-100 text-amber-600"
            }`}>
              {result.verified ? "✓" : "⏳"}
            </div>

            <h3 className={`text-lg font-semibold ${result.verified ? "text-emerald-800" : "text-amber-800"}`}>
              {result.verified ? "Payment Verified!" : "Payment Submitted"}
            </h3>
            <p className={`text-sm mt-2 ${result.verified ? "text-emerald-600" : "text-amber-600"}`}>
              {result.detail}
            </p>

            {result.verified && (
              <p className="text-xs text-emerald-500 mt-3">
                Your token allocation has been confirmed. Check your dashboard for updated balances.
              </p>
            )}
            {!result.verified && (
              <p className="text-xs text-amber-500 mt-3">
                Our team will review your payment and update your account shortly.
              </p>
            )}

            {txHash && selectedMethod && selectedMethod !== "wire" && (
              <a
                href={getExplorerUrl(selectedMethod, txHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-3 text-xs text-kayan-600 hover:text-kayan-800 font-medium"
              >
                View on {CHAIN_LABELS[selectedMethod]} Explorer →
              </a>
            )}
          </div>
          <Button variant="secondary" onClick={resetFlow} className="w-full">Back to Payments</Button>
        </div>
      )}
    </Card>
  );
}
