"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useAdminRole } from "@/lib/hooks";
import { SaftRound } from "@/lib/types";

// ── Shared input styles ──
const inputCls =
  "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500";

// ═════════════════════════════════════════════════════════════
// ROUND FORM — reused for both Create and Edit
// ═════════════════════════════════════════════════════════════

interface RoundFormData {
  name: string;
  token_price: string;
  tge_unlock_pct: string;
  cliff_months: string;
  vesting_months: string;
  closing_date: string;
}

/** Empty form state */
const emptyForm = (): RoundFormData => ({
  name: "",
  token_price: "",
  tge_unlock_pct: "0",
  cliff_months: "0",
  vesting_months: "",
  closing_date: "",
});

/** Populate form from an existing round */
const formFromRound = (r: SaftRound): RoundFormData => ({
  name: r.name,
  token_price: r.token_price != null ? String(r.token_price) : "",
  tge_unlock_pct: String(r.tge_unlock_pct),
  cliff_months: String(r.cliff_months),
  vesting_months: String(r.vesting_months),
  closing_date: r.closing_date
    ? new Date(r.closing_date).toISOString().split("T")[0]
    : "",
});

/**
 * RoundFormFields — the 6 input fields, rendered identically
 * for create and edit. No submit button — parent handles that.
 */
function RoundFormFields({
  form,
  onChange,
}: {
  form: RoundFormData;
  onChange: (f: RoundFormData) => void;
}) {
  // Shorthand: update one field
  const set = (key: keyof RoundFormData, val: string) =>
    onChange({ ...form, [key]: val });

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Round Name *
        </label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="e.g., Seed"
          className={inputCls}
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Token Price (USD)
        </label>
        <input
          type="number"
          step="0.001"
          value={form.token_price}
          onChange={(e) => set("token_price", e.target.value)}
          placeholder="0.01"
          className={inputCls}
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          TGE Unlock %
        </label>
        <input
          type="number"
          value={form.tge_unlock_pct}
          onChange={(e) => set("tge_unlock_pct", e.target.value)}
          placeholder="10"
          className={inputCls}
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Cliff (months)
        </label>
        <input
          type="number"
          value={form.cliff_months}
          onChange={(e) => set("cliff_months", e.target.value)}
          placeholder="6"
          className={inputCls}
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Vesting Duration (months) *
        </label>
        <input
          type="number"
          value={form.vesting_months}
          onChange={(e) => set("vesting_months", e.target.value)}
          placeholder="24"
          className={inputCls}
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Closing Date
        </label>
        <input
          type="date"
          value={form.closing_date}
          onChange={(e) => set("closing_date", e.target.value)}
          className={inputCls}
        />
        <p className="text-[11px] text-gray-400 mt-0.5">
          Optional. After this date, no new investors or capital calls.
        </p>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// EDIT MODAL
// ═════════════════════════════════════════════════════════════

function EditRoundModal({
  round,
  onClose,
  onSaved,
}: {
  round: SaftRound;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<RoundFormData>(formFromRound(round));
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.name || !form.vesting_months) {
      toast.error("Name and vesting duration are required");
      return;
    }

    setSaving(true);

    // Build payload — only send fields that changed
    const payload: Record<string, any> = { id: round.id };
    if (form.name !== round.name) payload.name = form.name;
    if (form.token_price !== (round.token_price != null ? String(round.token_price) : ""))
      payload.token_price = form.token_price ? Number(form.token_price) : null;
    if (form.tge_unlock_pct !== String(round.tge_unlock_pct))
      payload.tge_unlock_pct = Number(form.tge_unlock_pct);
    if (form.cliff_months !== String(round.cliff_months))
      payload.cliff_months = Number(form.cliff_months);
    if (form.vesting_months !== String(round.vesting_months))
      payload.vesting_months = Number(form.vesting_months);

    const oldClosing = round.closing_date
      ? new Date(round.closing_date).toISOString().split("T")[0]
      : "";
    if (form.closing_date !== oldClosing)
      payload.closing_date = form.closing_date
        ? new Date(form.closing_date).toISOString()
        : null;

    const res = await fetch("/api/admin/rounds", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setSaving(false);

    if (res.ok) {
      toast.success(`Round "${form.name}" updated`);
      onSaved();
      onClose();
    } else {
      const err = await res.json();
      toast.error(err.error || "Failed to update round");
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">
            Edit Round — {round.name}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        {/* Form fields (same layout as create) */}
        <RoundFormFields form={form} onChange={setForm} />

        {/* Actions */}
        <div className="flex items-center gap-2 pt-2">
          <Button
            onClick={handleSave}
            loading={saving}
            disabled={!form.name || !form.vesting_months}
          >
            Save Changes
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// MAIN PAGE
// ═════════════════════════════════════════════════════════════

export default function RoundsPage() {
  const { canWrite } = useAdminRole();
  const [rounds, setRounds] = useState<SaftRound[]>([]);
  const [loading, setLoading] = useState(true);

  // Create form
  const [showForm, setShowForm] = useState(false);
  const [createForm, setCreateForm] = useState<RoundFormData>(emptyForm());
  const [saving, setSaving] = useState(false);

  // Edit modal
  const [editingRound, setEditingRound] = useState<SaftRound | null>(null);

  const fetchRounds = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/rounds");
    if (res.ok) setRounds(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchRounds();
  }, [fetchRounds]);

  // ── Create ──
  const handleCreate = async () => {
    if (!createForm.name || !createForm.vesting_months) return;
    setSaving(true);

    const res = await fetch("/api/admin/rounds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: createForm.name,
        token_price: createForm.token_price
          ? Number(createForm.token_price)
          : null,
        tge_unlock_pct: Number(createForm.tge_unlock_pct),
        cliff_months: Number(createForm.cliff_months),
        vesting_months: Number(createForm.vesting_months),
        closing_date: createForm.closing_date
          ? new Date(createForm.closing_date).toISOString()
          : null,
      }),
    });

    setSaving(false);

    if (res.ok) {
      toast.success(`Round "${createForm.name}" created`);
      setCreateForm(emptyForm());
      setShowForm(false);
      fetchRounds();
    } else {
      const err = await res.json();
      toast.error(err.error || "Failed to create round");
    }
  };

  // ── Delete ──
  const handleDelete = async (round: SaftRound) => {
    if (
      !confirm(
        `Delete the "${round.name}" round? This will also remove all allocations in this round.`
      )
    )
      return;

    const res = await fetch(`/api/admin/rounds?id=${round.id}`, {
      method: "DELETE",
    });

    if (res.ok) {
      toast.success(`Round "${round.name}" deleted`);
      fetchRounds();
    } else {
      toast.error("Failed to delete round");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/admin/investors"
          className="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.75 19.5L8.25 12l7.5-7.5"
            />
          </svg>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">SAFT Rounds</h1>
          <p className="text-sm text-gray-500 mt-1">
            Define funding rounds and their vesting terms
          </p>
        </div>
      </div>

      {/* Rounds Table */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <CardHeader
            title="Rounds"
            subtitle={`${rounds.length} round${rounds.length !== 1 ? "s" : ""} configured`}
          />
          {canWrite && (
            <Button onClick={() => setShowForm(!showForm)} size="sm">
              {showForm ? "Cancel" : "New Round"}
            </Button>
          )}
        </div>

        {/* ── Create form (reuses RoundFormFields) ── */}
        {showForm && (
          <div className="bg-gray-50 rounded-lg p-4 mb-4 border border-gray-200">
            <RoundFormFields form={createForm} onChange={setCreateForm} />
            <div className="mt-3">
              <Button
                onClick={handleCreate}
                loading={saving}
                disabled={!createForm.name || !createForm.vesting_months}
              >
                Create Round
              </Button>
            </div>
          </div>
        )}

        {/* ── Table ── */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-3 px-2 font-medium text-gray-500">Name</th>
                <th className="text-right py-3 px-2 font-medium text-gray-500">Price</th>
                <th className="text-right py-3 px-2 font-medium text-gray-500">TGE %</th>
                <th className="text-right py-3 px-2 font-medium text-gray-500">Cliff</th>
                <th className="text-right py-3 px-2 font-medium text-gray-500">Vesting</th>
                <th className="text-right py-3 px-2 font-medium text-gray-500">Closing</th>
                {canWrite && (
                  <th className="text-right py-3 px-2 font-medium text-gray-500"></th>
                )}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-gray-400">
                    Loading...
                  </td>
                </tr>
              ) : rounds.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-gray-400">
                    No rounds configured yet
                  </td>
                </tr>
              ) : (
                rounds.map((round) => {
                  const closed =
                    round.closing_date && new Date(round.closing_date) < new Date();
                  return (
                    <tr
                      key={round.id}
                      className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50"
                    >
                      <td className="py-3 px-2 font-medium text-gray-900">
                        {round.name}
                      </td>
                      <td className="py-3 px-2 text-right text-gray-700">
                        {round.token_price ? `$${round.token_price}` : "—"}
                      </td>
                      <td className="py-3 px-2 text-right text-gray-700">
                        {round.tge_unlock_pct}%
                      </td>
                      <td className="py-3 px-2 text-right text-gray-700">
                        {round.cliff_months}mo
                      </td>
                      <td className="py-3 px-2 text-right text-gray-700">
                        {round.vesting_months}mo
                      </td>
                      <td className="py-3 px-2 text-right text-gray-700">
                        {round.closing_date ? (
                          <span className={closed ? "text-red-500" : ""}>
                            {new Date(round.closing_date).toLocaleDateString()}
                            {closed ? " (closed)" : ""}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      {canWrite && (
                        <td className="py-3 px-2 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => setEditingRound(round)}
                              className="text-brand-600 hover:text-brand-800 text-xs font-medium"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDelete(round)}
                              className="text-red-500 hover:text-red-700 text-xs font-medium"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ── Edit modal ── */}
      {editingRound && (
        <EditRoundModal
          round={editingRound}
          onClose={() => setEditingRound(null)}
          onSaved={fetchRounds}
        />
      )}
    </div>
  );
}
