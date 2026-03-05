"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { toast } from "sonner";

// ── Types ──

interface Pool {
  id: string; name: string; description: string | null;
  token_budget: number; color: string; is_active: boolean;
  grants_count: number; tokens_granted: number; tokens_vested: number; tokens_available: number;
}

interface Grant {
  id: string; pool_id: string; recipient_name: string; recipient_email: string | null;
  recipient_role: string | null; recipient_type: string;
  token_amount: number; grant_date: string; exercise_price: number | null;
  tge_unlock_pct: number; cliff_months: number; vesting_months: number;
  status: string; termination_date: string | null; termination_handling: string | null;
  wallet_address: string | null; notes: string | null;
  tokens_vested: number; tokens_unvested: number; pct_vested: number;
  months_until_fully_vested: number;
}

interface Totals {
  total_budget: number; total_granted: number; total_vested: number;
  reserved_tokens: number; budget_remaining: number;
}

const fmt = (n: number) => n.toLocaleString();
const fmtPct = (n: number) => `${n.toFixed(1)}%`;
const inputCls = "w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500";

const GRANT_STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700",
  fully_vested: "bg-blue-100 text-blue-700",
  terminated: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-500",
};

const RECIPIENT_TYPES = [
  { value: "employee", label: "Employee" },
  { value: "advisor", label: "Advisor" },
  { value: "contractor", label: "Contractor" },
  { value: "other", label: "Other" },
];

// ── Stat Card ──

function StatCard({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div className={`border rounded-xl p-4 ${warn ? "bg-amber-50 border-amber-200" : "bg-white border-gray-200"}`}>
      <p className="text-[11px] text-gray-500 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-xl font-bold ${warn ? "text-amber-700" : "text-gray-900"}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// POOL MODAL (create / edit)
// ═══════════════════════════════════════════════════════════

function PoolModal({ pool, onClose, onSaved }: { pool?: Pool; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(pool?.name || "");
  const [description, setDescription] = useState(pool?.description || "");
  const [budget, setBudget] = useState(pool ? String(pool.token_budget) : "");
  const [color, setColor] = useState(pool?.color || "8b5cf6");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name) { toast.error("Pool name required"); return; }
    setSaving(true);
    const res = await fetch("/api/admin/pools", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pool
        ? { action: "update", pool_id: pool.id, name, description, token_budget: Number(budget) || 0, color }
        : { action: "create", name, description, token_budget: Number(budget) || 0, color }
      ),
    });
    setSaving(false);
    if (res.ok) { toast.success(pool ? "Pool updated" : "Pool created"); onSaved(); onClose(); }
    else { const e = await res.json(); toast.error(e.error || "Failed"); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">{pool ? "Edit Pool" : "Create Pool"}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Team ESOP" className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Purpose of this pool" className={inputCls} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Token Budget</label>
            <input type="number" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="0" className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Color (hex)</label>
            <div className="flex items-center gap-2">
              <input type="text" value={color} onChange={(e) => setColor(e.target.value.replace("#", ""))} placeholder="8b5cf6" className={`${inputCls} font-mono`} />
              <div className="w-8 h-8 rounded-lg border border-gray-200 flex-shrink-0" style={{ backgroundColor: `#${color}` }} />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 pt-2">
          <Button onClick={handleSave} loading={saving}>{pool ? "Save" : "Create"}</Button>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// GRANT MODAL (create / edit)
// ═══════════════════════════════════════════════════════════

function GrantModal({ poolId, grant, onClose, onSaved }: {
  poolId: string; grant?: Grant; onClose: () => void; onSaved: () => void;
}) {
  const [name, setName] = useState(grant?.recipient_name || "");
  const [email, setEmail] = useState(grant?.recipient_email || "");
  const [role, setRole] = useState(grant?.recipient_role || "");
  const [type, setType] = useState(grant?.recipient_type || "employee");
  const [amount, setAmount] = useState(grant ? String(grant.token_amount) : "");
  const [grantDate, setGrantDate] = useState(grant?.grant_date || new Date().toISOString().split("T")[0]);
  const [exercisePrice, setExercisePrice] = useState(grant?.exercise_price ? String(grant.exercise_price) : "");
  const [tgePct, setTgePct] = useState(grant ? String(grant.tge_unlock_pct) : "0");
  const [cliff, setCliff] = useState(grant ? String(grant.cliff_months) : "12");
  const [vesting, setVesting] = useState(grant ? String(grant.vesting_months) : "36");
  const [wallet, setWallet] = useState(grant?.wallet_address || "");
  const [notes, setNotes] = useState(grant?.notes || "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name || !amount) { toast.error("Name and token amount required"); return; }
    setSaving(true);

    const payload: any = {
      action: grant ? "update" : "create",
      recipient_name: name, recipient_email: email || null,
      recipient_role: role || null, recipient_type: type,
      token_amount: Number(amount),
      grant_date: grantDate,
      exercise_price: exercisePrice ? Number(exercisePrice) : null,
      tge_unlock_pct: Number(tgePct) || 0,
      cliff_months: Number(cliff) || 0,
      vesting_months: Number(vesting) || 1,
      wallet_address: wallet || null, notes: notes || null,
    };
    if (grant) payload.grant_id = grant.id;

    const res = await fetch(`/api/admin/pools/${poolId}/grants`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (res.ok) { toast.success(grant ? "Grant updated" : "Grant created"); onSaved(); onClose(); }
    else { const e = await res.json(); toast.error(e.error || "Failed"); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">{grant ? "Edit Grant" : "Add Grant"}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Recipient Name *</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Role</label>
            <input type="text" value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. CTO, Advisor" className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
            <select value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>
              {RECIPIENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Token Amount *</label>
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Grant Date</label>
            <input type="date" value={grantDate} onChange={(e) => setGrantDate(e.target.value)} className={inputCls} />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Exercise Price (optional)</label>
          <input type="number" value={exercisePrice} onChange={(e) => setExercisePrice(e.target.value)} step="0.01" placeholder="Leave blank for outright grant" className={inputCls} />
        </div>

        <div className="border-t border-gray-100 pt-3">
          <p className="text-xs font-semibold text-gray-700 mb-2">Vesting Schedule</p>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[10px] text-gray-500 mb-1">TGE Unlock %</label>
              <input type="number" value={tgePct} onChange={(e) => setTgePct(e.target.value)} min="0" max="100" className={inputCls} />
            </div>
            <div>
              <label className="block text-[10px] text-gray-500 mb-1">Cliff (months)</label>
              <input type="number" value={cliff} onChange={(e) => setCliff(e.target.value)} min="0" className={inputCls} />
            </div>
            <div>
              <label className="block text-[10px] text-gray-500 mb-1">Linear Vesting (months)</label>
              <input type="number" value={vesting} onChange={(e) => setVesting(e.target.value)} min="1" className={inputCls} />
            </div>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Wallet Address</label>
          <input type="text" value={wallet} onChange={(e) => setWallet(e.target.value)} placeholder="0x..." className={`${inputCls} font-mono text-xs`} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputCls} />
        </div>

        <div className="flex items-center gap-2 pt-2">
          <Button onClick={handleSave} loading={saving}>{grant ? "Save" : "Create Grant"}</Button>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// TERMINATE MODAL
// ═══════════════════════════════════════════════════════════

function TerminateModal({ poolId, grant, onClose, onSaved }: {
  poolId: string; grant: Grant; onClose: () => void; onSaved: () => void;
}) {
  const [termDate, setTermDate] = useState(new Date().toISOString().split("T")[0]);
  const [handling, setHandling] = useState("vest_to_date");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const res = await fetch(`/api/admin/pools/${poolId}/grants`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "terminate", grant_id: grant.id,
        termination_date: termDate, termination_handling: handling, notes,
      }),
    });
    setSaving(false);
    if (res.ok) { toast.success("Grant terminated"); onSaved(); onClose(); }
    else { const e = await res.json(); toast.error(e.error || "Failed"); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 space-y-4">
        <h3 className="font-semibold text-gray-900">Terminate Grant</h3>
        <p className="text-xs text-gray-500">Terminate vesting for <strong>{grant.recipient_name}</strong> ({fmt(grant.token_amount)} tokens)</p>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Termination Date</label>
          <input type="date" value={termDate} onChange={(e) => setTermDate(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Handling</label>
          <select value={handling} onChange={(e) => setHandling(e.target.value)} className={inputCls}>
            <option value="vest_to_date">Vest to Date — keep vested, forfeit rest</option>
            <option value="cliff_forfeit">Cliff Forfeit — forfeit all if before cliff</option>
            <option value="accelerated">Accelerated — full vesting on termination</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputCls} />
        </div>
        <div className="flex items-center gap-2 pt-2">
          <Button onClick={handleSave} loading={saving} className="bg-red-600 hover:bg-red-700">Terminate</Button>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// GRANT TABLE (per pool)
// ═══════════════════════════════════════════════════════════

function GrantTable({ poolId, onRefresh }: { poolId: string; onRefresh: () => void }) {
  const [grants, setGrants] = useState<Grant[]>([]);
  const [loading, setLoading] = useState(true);
  const [editGrant, setEditGrant] = useState<Grant | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [terminateGrant, setTerminateGrant] = useState<Grant | null>(null);

  const fetchGrants = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/pools/${poolId}/grants?limit=200`);
    if (res.ok) { const d = await res.json(); setGrants(d.grants || []); }
    setLoading(false);
  }, [poolId]);

  useEffect(() => { fetchGrants(); }, [fetchGrants]);

  const doAction = async (action: string, grantId: string) => {
    const res = await fetch(`/api/admin/pools/${poolId}/grants`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, grant_id: grantId }),
    });
    if (res.ok) { toast.success(`Grant ${action}led`); fetchGrants(); onRefresh(); }
    else { const e = await res.json(); toast.error(e.error || "Failed"); }
  };

  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-gray-700">Grants</p>
        <Button size="sm" variant="secondary" onClick={() => setShowAdd(true)} className="text-xs">+ Add Grant</Button>
      </div>

      {loading ? (
        <p className="text-xs text-gray-400 py-3 text-center">Loading…</p>
      ) : grants.length === 0 ? (
        <p className="text-xs text-gray-400 py-3 text-center">No grants yet</p>
      ) : (
        <div className="overflow-x-auto -mx-5 px-5">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 text-gray-500">
                <th className="py-1.5 px-2 text-left font-medium">Recipient</th>
                <th className="py-1.5 px-2 text-left font-medium">Type</th>
                <th className="py-1.5 px-2 text-right font-medium">Tokens</th>
                <th className="py-1.5 px-2 text-right font-medium">Vested</th>
                <th className="py-1.5 px-2 text-right font-medium">%</th>
                <th className="py-1.5 px-2 text-left font-medium">Schedule</th>
                <th className="py-1.5 px-2 text-center font-medium">Status</th>
                <th className="py-1.5 px-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {grants.map((g) => (
                <tr key={g.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="py-2 px-2">
                    <p className="font-medium text-gray-900">{g.recipient_name}</p>
                    {g.recipient_role && <p className="text-gray-400">{g.recipient_role}</p>}
                  </td>
                  <td className="py-2 px-2 capitalize text-gray-600">{g.recipient_type}</td>
                  <td className="py-2 px-2 text-right font-medium text-gray-900">{fmt(g.token_amount)}</td>
                  <td className="py-2 px-2 text-right text-gray-700">{fmt(g.tokens_vested)}</td>
                  <td className="py-2 px-2 text-right text-gray-500">{fmtPct(g.pct_vested)}</td>
                  <td className="py-2 px-2 text-gray-500">{g.tge_unlock_pct}% · {g.cliff_months}mo · {g.vesting_months}mo</td>
                  <td className="py-2 px-2 text-center">
                    <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${GRANT_STATUS_COLORS[g.status] || "bg-gray-100 text-gray-500"}`}>
                      {g.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {g.status === "active" && (
                        <>
                          <button onClick={() => setEditGrant(g)} className="text-gray-400 hover:text-gray-600 text-[10px]">Edit</button>
                          <button onClick={() => setTerminateGrant(g)} className="text-red-400 hover:text-red-600 text-[10px]">Term</button>
                        </>
                      )}
                      {g.status === "active" && (
                        <button onClick={() => doAction("cancel", g.id)} className="text-gray-400 hover:text-gray-600 text-[10px]">Cancel</button>
                      )}
                      {g.status === "cancelled" && (
                        <button onClick={() => doAction("delete", g.id)} className="text-red-400 hover:text-red-600 text-[10px]">Delete</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && <GrantModal poolId={poolId} onClose={() => setShowAdd(false)} onSaved={() => { fetchGrants(); onRefresh(); }} />}
      {editGrant && <GrantModal poolId={poolId} grant={editGrant} onClose={() => setEditGrant(null)} onSaved={() => { fetchGrants(); onRefresh(); }} />}
      {terminateGrant && <TerminateModal poolId={poolId} grant={terminateGrant} onClose={() => setTerminateGrant(null)} onSaved={() => { fetchGrants(); onRefresh(); }} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════

export default function AdminPoolsPage() {
  const [pools, setPools] = useState<Pool[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPoolModal, setShowPoolModal] = useState(false);
  const [editPool, setEditPool] = useState<Pool | null>(null);
  const [expandedPool, setExpandedPool] = useState<string | null>(null);

  const fetchPools = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/pools");
    if (res.ok) { const d = await res.json(); setPools(d.pools || []); setTotals(d.totals || null); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchPools(); }, [fetchPools]);

  const handleDelete = async (poolId: string) => {
    if (!confirm("Delete this pool?")) return;
    const res = await fetch("/api/admin/pools", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", pool_id: poolId }),
    });
    if (res.ok) { toast.success("Pool deleted"); fetchPools(); }
    else { const e = await res.json(); toast.error(e.error || "Cannot delete"); }
  };

  const budgetOverflow = totals && totals.budget_remaining < 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Token Pools</h1>
          <p className="text-sm text-gray-500 mt-1">ESOP, team, advisor, and ecosystem token management</p>
        </div>
        <div className="flex items-center gap-2">
          <a href="/api/admin/export?type=pool_grants" download className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors">
            ↓ Export Grants
          </a>
          <Button onClick={() => setShowPoolModal(true)}>Create Pool</Button>
        </div>
      </div>

      {/* Stats */}
      {totals && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatCard label="Reserved Budget" value={fmt(totals.reserved_tokens)} sub="From entity config" />
          <StatCard label="Pool Budgets" value={fmt(totals.total_budget)} sub={`${pools.length} pool${pools.length !== 1 ? "s" : ""}`} />
          <StatCard label="Unallocated Reserve" value={fmt(Math.max(0, totals.budget_remaining))} sub={budgetOverflow ? "⚠ Pools exceed reserve" : "Available for new pools"} warn={!!budgetOverflow} />
          <StatCard label="Total Granted" value={fmt(totals.total_granted)} sub="Across all pools" />
          <StatCard label="Total Vested" value={fmt(totals.total_vested)} sub="Computed from schedules" />
        </div>
      )}

      {/* Budget warning */}
      {budgetOverflow && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
          Pool budgets ({fmt(totals!.total_budget)}) exceed the reserved token allocation ({fmt(totals!.reserved_tokens)}).
          Consider increasing the reserved tokens in Settings → Branding → Token Supply, or reducing pool budgets.
        </div>
      )}

      {/* Pool Cards */}
      {loading ? (
        <p className="text-gray-400 text-center py-12">Loading pools…</p>
      ) : pools.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <p className="text-sm text-gray-500 mb-3">No token pools configured yet. Create one to start tracking team and advisor allocations.</p>
            <Button onClick={() => setShowPoolModal(true)}>Create First Pool</Button>
          </div>
        </Card>
      ) : pools.map((pool) => (
        <Card key={pool.id}>
          <div
            className="flex items-center gap-3 cursor-pointer"
            onClick={() => setExpandedPool(expandedPool === pool.id ? null : pool.id)}
          >
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: `#${pool.color}` }} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-gray-900">{pool.name}</h3>
                {!pool.is_active && <span className="text-[9px] px-1 py-0.5 bg-gray-100 text-gray-500 rounded">Inactive</span>}
              </div>
              {pool.description && <p className="text-xs text-gray-500 truncate">{pool.description}</p>}
            </div>

            {/* Stats strip */}
            <div className="flex items-center gap-6 text-xs text-gray-600">
              <div className="text-right">
                <p className="font-medium text-gray-900">{fmt(pool.tokens_granted)} / {fmt(pool.token_budget)}</p>
                <p className="text-gray-400">granted</p>
              </div>
              <div className="text-right">
                <p className="font-medium text-gray-900">{fmt(pool.tokens_vested)}</p>
                <p className="text-gray-400">vested</p>
              </div>
              <div className="text-right">
                <p className="font-medium text-gray-900">{pool.grants_count}</p>
                <p className="text-gray-400">grants</p>
              </div>
            </div>

            {/* Pool actions */}
            <div className="flex items-center gap-1">
              <button
                onClick={(e) => { e.stopPropagation(); setEditPool(pool); }}
                className="px-2 py-1 text-[11px] text-gray-500 hover:text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md"
              >
                Edit
              </button>
              {pool.grants_count === 0 && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(pool.id); }}
                  className="px-2 py-1 text-[11px] text-red-400 hover:text-red-600 bg-red-50 hover:bg-red-100 rounded-md"
                >
                  Delete
                </button>
              )}
              <span className="text-gray-300 text-sm ml-1">{expandedPool === pool.id ? "▼" : "▶"}</span>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${pool.token_budget > 0 ? Math.min(100, (pool.tokens_granted / pool.token_budget) * 100) : 0}%`,
                backgroundColor: `#${pool.color}`,
              }}
            />
          </div>

          {/* Grant table (expanded) */}
          {expandedPool === pool.id && (
            <GrantTable poolId={pool.id} onRefresh={fetchPools} />
          )}
        </Card>
      ))}

      {/* Modals */}
      {showPoolModal && <PoolModal onClose={() => setShowPoolModal(false)} onSaved={fetchPools} />}
      {editPool && <PoolModal pool={editPool} onClose={() => setEditPool(null)} onSaved={fetchPools} />}
    </div>
  );
}
