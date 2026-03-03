"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { toast } from "sonner";
import { useAdminRole } from "@/lib/hooks";

// ─── Types (mirror server-side PaymentSettings) ─────────────

interface MethodConfig {
  enabled: boolean;
  label: string;
  sublabel: string;
  icon: string;
}

interface PaymentSettings {
  methods: Record<string, MethodConfig>;
  wallets: { ethereum: string; solana: string };
  wire_instructions: {
    bank_name: string;
    account_name: string;
    account_number: string;
    routing_number: string;
    swift_code: string;
    reference_note: string;
  };
  capital_call_payment_days: number;
}

// ─── Method display order ───────────────────────────────────

const METHOD_ORDER = ["wire", "usdc_eth", "usdc_sol", "usdt_eth", "credit_card"];

// ─── Main Component ─────────────────────────────────────────

export function PaymentSettingsAdmin() {
  const [settings, setSettings] = useState<PaymentSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const { isManager } = useAdminRole();

  // Fetch current settings
  const fetchSettings = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/payment-settings");
    if (res.ok) {
      const data = await res.json();
      setSettings(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  // ── Save handler ──
  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);

    const res = await fetch("/api/admin/payment-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });

    if (res.ok) {
      const fresh = await res.json();
      setSettings(fresh);
      setDirty(false);
      toast.success("Payment settings saved");
    } else {
      const d = await res.json();
      toast.error(d.error || "Failed to save");
    }
    setSaving(false);
  };

  // ── Local update helpers (optimistic) ──

  const toggleMethod = (id: string) => {
    if (!settings) return;
    setSettings({
      ...settings,
      methods: {
        ...settings.methods,
        [id]: { ...settings.methods[id], enabled: !settings.methods[id].enabled },
      },
    });
    setDirty(true);
  };

  const updateWallet = (chain: "ethereum" | "solana", value: string) => {
    if (!settings) return;
    setSettings({
      ...settings,
      wallets: { ...settings.wallets, [chain]: value },
    });
    setDirty(true);
  };

  const updateWire = (field: string, value: string) => {
    if (!settings) return;
    setSettings({
      ...settings,
      wire_instructions: { ...settings.wire_instructions, [field]: value },
    });
    setDirty(true);
  };

  if (loading || !settings) {
    return <Card><CardHeader title="Payment Settings" /><p className="text-sm text-gray-400">Loading…</p></Card>;
  }

  const inputCls = "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono";
  const labelCls = "block text-xs font-medium text-gray-500 mb-1";
  // Admin role required to edit (manager can only view)
  const canEdit = isManager; // isManager is true for manager+admin+super_admin from the hook

  return (
    <div className="space-y-6">
      {/* ── Payment Methods ── */}
      <Card>
        <CardHeader
          title="Payment Methods"
          subtitle="Toggle which methods investors can use to pay"
        />
        <div className="space-y-2">
          {METHOD_ORDER.map((id) => {
            const m = settings.methods[id];
            if (!m) return null;

            return (
              <div
                key={id}
                className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                  m.enabled
                    ? "border-brand-200 bg-brand-50/30"
                    : "border-gray-200 bg-gray-50 opacity-60"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl w-8 text-center">{m.icon}</span>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{m.label}</p>
                    <p className="text-xs text-gray-400">{m.sublabel}</p>
                  </div>
                </div>
                {canEdit ? (
                  <button
                    onClick={() => toggleMethod(id)}
                    className={`relative w-11 h-6 rounded-full transition-colors ${
                      m.enabled ? "bg-brand-600" : "bg-gray-300"
                    }`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                      m.enabled ? "translate-x-5" : "translate-x-0"
                    }`} />
                  </button>
                ) : (
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    m.enabled ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"
                  }`}>
                    {m.enabled ? "Active" : "Disabled"}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* ── Receiving Wallets ── */}
      <Card>
        <CardHeader
          title="Receiving Wallets"
          subtitle="Crypto wallet addresses displayed to investors and used for on-chain verification"
        />
        <div className="space-y-4">
          <div>
            <label className={labelCls}>Ethereum Wallet (receives USDC + USDT)</label>
            <input
              type="text"
              value={settings.wallets.ethereum}
              onChange={(e) => updateWallet("ethereum", e.target.value.trim())}
              placeholder="0x..."
              className={inputCls}
              readOnly={!canEdit}
            />
          </div>
          <div>
            <label className={labelCls}>Solana Wallet (receives USDC)</label>
            <input
              type="text"
              value={settings.wallets.solana}
              onChange={(e) => updateWallet("solana", e.target.value.trim())}
              placeholder="Base58 address..."
              className={inputCls}
              readOnly={!canEdit}
            />
          </div>
        </div>
      </Card>

      {/* ── Wire Transfer Instructions ── */}
      <Card>
        <CardHeader
          title="Wire Transfer Instructions"
          subtitle="Bank details shown to investors when they select wire transfer"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Bank Name</label>
            <input
              type="text"
              value={settings.wire_instructions.bank_name}
              onChange={(e) => updateWire("bank_name", e.target.value)}
              placeholder="e.g. JPMorgan Chase"
              className={inputCls.replace("font-mono", "")}
              readOnly={!canEdit}
            />
          </div>
          <div>
            <label className={labelCls}>Account Name</label>
            <input
              type="text"
              value={settings.wire_instructions.account_name}
              onChange={(e) => updateWire("account_name", e.target.value)}
              placeholder="e.g. Company Name Ltd"
              className={inputCls.replace("font-mono", "")}
              readOnly={!canEdit}
            />
          </div>
          <div>
            <label className={labelCls}>Account Number</label>
            <input
              type="text"
              value={settings.wire_instructions.account_number}
              onChange={(e) => updateWire("account_number", e.target.value)}
              placeholder="e.g. 123456789"
              className={inputCls}
              readOnly={!canEdit}
            />
          </div>
          <div>
            <label className={labelCls}>Routing Number</label>
            <input
              type="text"
              value={settings.wire_instructions.routing_number}
              onChange={(e) => updateWire("routing_number", e.target.value)}
              placeholder="e.g. 021000021"
              className={inputCls}
              readOnly={!canEdit}
            />
          </div>
          <div>
            <label className={labelCls}>SWIFT / BIC Code</label>
            <input
              type="text"
              value={settings.wire_instructions.swift_code}
              onChange={(e) => updateWire("swift_code", e.target.value)}
              placeholder="e.g. CHASUS33"
              className={inputCls}
              readOnly={!canEdit}
            />
          </div>
          <div>
            <label className={labelCls}>Reference Note (shown to investor)</label>
            <input
              type="text"
              value={settings.wire_instructions.reference_note}
              onChange={(e) => updateWire("reference_note", e.target.value)}
              placeholder='e.g. Include "Your Name — Token Name"'
              className={inputCls.replace("font-mono", "")}
              readOnly={!canEdit}
            />
          </div>
        </div>
      </Card>

      {/* ── Capital Call Settings ── */}
      <Card>
        <CardHeader
          title="Capital Call Settings"
          subtitle="Default payment terms for new capital calls"
        />
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Payment Deadline (business days after issuance)</label>
            <input
              type="number"
              min={1}
              max={90}
              className="block w-32 rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-brand-500"
              value={settings.capital_call_payment_days ?? 10}
              onChange={(e) => {
                setSettings({ ...settings, capital_call_payment_days: parseInt(e.target.value) || 10 });
                setDirty(true);
              }}
            />
            <p className="text-[11px] text-gray-400 mt-1">
              When a capital call is issued, investors will have this many business days to complete payment. Weekends are excluded.
            </p>
          </div>
        </div>
      </Card>

      {/* ── Save button ── */}
      {canEdit && dirty && (
        <div className="sticky bottom-4 flex justify-end">
          <Button onClick={handleSave} loading={saving} className="shadow-lg">
            Save Payment Settings
          </Button>
        </div>
      )}
    </div>
  );
}
