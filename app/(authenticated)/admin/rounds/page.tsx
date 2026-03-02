"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useAdminRole } from "@/lib/hooks";
import { SaftRound } from "@/lib/types";

export default function RoundsPage() {
  const { canWrite } = useAdminRole();
  const [rounds, setRounds] = useState<SaftRound[]>([]);
  const [loading, setLoading] = useState(true);

  // New round form state
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [tokenPrice, setTokenPrice] = useState("");
  const [tgeUnlockPct, setTgeUnlockPct] = useState("0");
  const [cliffMonths, setCliffMonths] = useState("0");
  const [vestingMonths, setVestingMonths] = useState("");
  const [closingDate, setClosingDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingClosingId, setEditingClosingId] = useState<string | null>(null);
  const [pendingClosing, setPendingClosing] = useState("");

  const fetchRounds = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/rounds");
    if (res.ok) setRounds(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchRounds();
  }, [fetchRounds]);

  const resetForm = () => {
    setName("");
    setTokenPrice("");
    setTgeUnlockPct("0");
    setCliffMonths("0");
    setVestingMonths("");
    setClosingDate("");
    setShowForm(false);
  };

  const handleCreate = async () => {
    if (!name || !vestingMonths) return;
    setSaving(true);

    const res = await fetch("/api/admin/rounds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        token_price: tokenPrice ? Number(tokenPrice) : null,
        tge_unlock_pct: Number(tgeUnlockPct),
        cliff_months: Number(cliffMonths),
        vesting_months: Number(vestingMonths),
        closing_date: closingDate ? new Date(closingDate).toISOString() : null,
      }),
    });

    setSaving(false);

    if (res.ok) {
      toast.success(`Round "${name}" created`);
      resetForm();
      fetchRounds();
    } else {
      const err = await res.json();
      toast.error(err.error || "Failed to create round");
    }
  };

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
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
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

        {/* Create Form */}
        {showForm && (
          <div className="bg-gray-50 rounded-lg p-4 mb-4 border border-gray-200">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Round Name *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Seed"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-kayan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Token Price (USD)
                </label>
                <input
                  type="number"
                  step="0.001"
                  value={tokenPrice}
                  onChange={(e) => setTokenPrice(e.target.value)}
                  placeholder="0.01"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-kayan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  TGE Unlock %
                </label>
                <input
                  type="number"
                  value={tgeUnlockPct}
                  onChange={(e) => setTgeUnlockPct(e.target.value)}
                  placeholder="10"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-kayan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Cliff (months)
                </label>
                <input
                  type="number"
                  value={cliffMonths}
                  onChange={(e) => setCliffMonths(e.target.value)}
                  placeholder="6"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-kayan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Vesting Duration (months) *
                </label>
                <input
                  type="number"
                  value={vestingMonths}
                  onChange={(e) => setVestingMonths(e.target.value)}
                  placeholder="24"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-kayan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Round Closing Date
                </label>
                <input
                  type="date"
                  value={closingDate}
                  onChange={(e) => setClosingDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-kayan-500"
                />
                <p className="text-[11px] text-gray-400 mt-0.5">Optional. After this date, no new investors, signing, or capital calls for this round.</p>
              </div>
            </div>

            <div className="mt-3">
              <Button
                onClick={handleCreate}
                loading={saving}
                disabled={!name || !vestingMonths}
              >
                Create Round
              </Button>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-3 px-2 font-medium text-gray-500">Name</th>
                <th className="text-right py-3 px-2 font-medium text-gray-500">Price</th>
                <th className="text-right py-3 px-2 font-medium text-gray-500">TGE %</th>
                <th className="text-right py-3 px-2 font-medium text-gray-500">Cliff</th>
                <th className="text-right py-3 px-2 font-medium text-gray-500">Vesting</th>
                <th className="text-right py-3 px-2 font-medium text-gray-500">Closing Date</th>
                <th className="text-right py-3 px-2 font-medium text-gray-500"></th>
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
                rounds.map((round) => (
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
                      {canWrite && editingClosingId === round.id ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <input
                            type="date"
                            value={pendingClosing}
                            onChange={(e) => setPendingClosing(e.target.value)}
                            className="w-32 px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-kayan-500"
                          />
                          <button
                            onClick={async () => {
                              const newClosingDate = pendingClosing ? new Date(pendingClosing).toISOString() : null;
                              const res = await fetch("/api/admin/rounds", {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ id: round.id, closing_date: newClosingDate }),
                              });
                              if (res.ok) {
                                toast.success(newClosingDate ? `Closing Date set for ${round.name}` : `Closing Date removed for ${round.name}`);
                                setEditingClosingId(null);
                                fetchRounds();
                              } else {
                                toast.error("Failed to update closing date");
                              }
                            }}
                            className="text-[11px] font-medium text-emerald-600 hover:text-emerald-800"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingClosingId(null)}
                            className="text-[11px] font-medium text-gray-400 hover:text-gray-600"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-2">
                          {round.closing_date ? (
                            (() => {
                              const d = new Date(round.closing_date);
                              const expired = d < new Date();
                              return (
                                <span className={expired ? "text-red-500" : ""}>
                                  {d.toLocaleDateString()}{expired ? " (expired)" : ""}
                                </span>
                              );
                            })()
                          ) : (
                            <span className="text-gray-300">None</span>
                          )}
                          {canWrite && (
                            <button
                              onClick={() => {
                                setEditingClosingId(round.id);
                                setPendingClosing(
                                  round.closing_date ? new Date(round.closing_date).toISOString().split("T")[0] : ""
                                );
                              }}
                              className="text-[11px] font-medium text-blue-500 hover:text-blue-700"
                            >
                              Edit
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-2 text-right">
                      {canWrite && (
                        <button
                          onClick={() => handleDelete(round)}
                          className="text-red-500 hover:text-red-700 text-xs font-medium"
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
