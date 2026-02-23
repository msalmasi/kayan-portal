"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { KycBadge } from "@/components/ui/Badge";
import { useAdminRole } from "@/lib/hooks";
import { formatTokenAmount } from "@/lib/vesting";
import { InvestorWithAllocations, SaftRound } from "@/lib/types";

export default function InvestorDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { canWrite } = useAdminRole();
  const investorId = params.id as string;

  const [investor, setInvestor] = useState<InvestorWithAllocations | null>(null);
  const [rounds, setRounds] = useState<SaftRound[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Editable fields
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [kycStatus, setKycStatus] = useState("unverified");

  // New allocation form
  const [newRoundId, setNewRoundId] = useState("");
  const [newTokenAmount, setNewTokenAmount] = useState("");

  // Fetch investor data and available rounds
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

    if (roundsRes.ok) {
      setRounds(await roundsRes.json());
    }

    setLoading(false);
  }, [investorId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Save investor changes
  const handleSave = async () => {
    setSaving(true);

    const res = await fetch(`/api/admin/investors/${investorId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        full_name: fullName,
        email,
        kyc_status: kycStatus,
      }),
    });

    setSaving(false);

    if (res.ok) {
      toast.success("Investor updated");
      fetchData();
    } else {
      const err = await res.json();
      toast.error(err.error || "Failed to update");
    }
  };

  // Add allocation
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

  // Remove allocation
  const handleRemoveAllocation = async (allocationId: string) => {
    if (!confirm("Remove this allocation?")) return;

    const res = await fetch(`/api/admin/allocations?id=${allocationId}`, {
      method: "DELETE",
    });

    if (res.ok) {
      toast.success("Allocation removed");
      fetchData();
    } else {
      toast.error("Failed to remove allocation");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  if (!investor) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Investor not found.</p>
        <Link href="/admin/investors" className="text-kayan-500 hover:underline text-sm mt-2 inline-block">
          ← Back to admin
        </Link>
      </div>
    );
  }

  /** Delete investor and redirect to list */
  const handleDelete = async () => {
    if (
      !confirm(
        `Permanently delete ${investor.full_name}? This will also remove all their allocations. This cannot be undone.`
      )
    )
      return;

    const res = await fetch(`/api/admin/investors/${investorId}`, {
      method: "DELETE",
    });

    if (res.ok) {
      toast.success(`Deleted ${investor.full_name}`);
      router.push("/admin/investors");
    } else {
      const err = await res.json();
      toast.error(err.error || "Failed to delete investor");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
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
            <h1 className="text-2xl font-bold text-gray-900">
              {investor.full_name}
            </h1>
            <p className="text-sm text-gray-500">{investor.email}</p>
          </div>
        </div>

        {canWrite && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDelete}
            className="text-red-500 hover:text-red-700 hover:bg-red-50"
          >
            Delete Investor
          </Button>
        )}
      </div>

      {/* Edit Investor Info */}
      <Card>
        <CardHeader title="Investor Details" />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Full Name
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-kayan-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-kayan-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              KYC Status
            </label>
            <select
              value={kycStatus}
              onChange={(e) => setKycStatus(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-kayan-500 bg-white"
            >
              <option value="unverified">Unverified</option>
              <option value="pending">Pending</option>
              <option value="verified">Verified</option>
            </select>
          </div>
        </div>

        {canWrite && (
          <div className="mt-4">
            <Button onClick={handleSave} loading={saving}>
              Save Changes
            </Button>
          </div>
        )}
      </Card>

      {/* Allocations */}
      <Card>
        <CardHeader
          title="Allocations"
          subtitle="Token allocations across funding rounds"
        />

        {/* Existing allocations */}
        <div className="overflow-x-auto mb-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-3 px-2 font-medium text-gray-500">Round</th>
                <th className="text-right py-3 px-2 font-medium text-gray-500">Tokens</th>
                <th className="text-right py-3 px-2 font-medium text-gray-500">TGE %</th>
                <th className="text-right py-3 px-2 font-medium text-gray-500">Cliff</th>
                <th className="text-right py-3 px-2 font-medium text-gray-500">Vesting</th>
                <th className="text-right py-3 px-2 font-medium text-gray-500"></th>
              </tr>
            </thead>
            <tbody>
              {investor.allocations.map((alloc) => (
                <tr key={alloc.id} className="border-b border-gray-50 last:border-0">
                  <td className="py-3 px-2 font-medium">{alloc.saft_rounds.name}</td>
                  <td className="py-3 px-2 text-right">
                    {formatTokenAmount(Number(alloc.token_amount))}
                  </td>
                  <td className="py-3 px-2 text-right">
                    {alloc.saft_rounds.tge_unlock_pct}%
                  </td>
                  <td className="py-3 px-2 text-right">
                    {alloc.saft_rounds.cliff_months}mo
                  </td>
                  <td className="py-3 px-2 text-right">
                    {alloc.saft_rounds.vesting_months}mo
                  </td>
                  <td className="py-3 px-2 text-right">
                    {canWrite && (
                      <button
                        onClick={() => handleRemoveAllocation(alloc.id)}
                        className="text-red-500 hover:text-red-700 text-xs font-medium"
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {investor.allocations.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-gray-400">
                    No allocations yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Add new allocation — hidden for staff */}
        {canWrite && (
          <div className="border-t border-gray-100 pt-4">
            <h3 className="text-sm font-medium text-gray-700 mb-3">
              Add Allocation
            </h3>
            <div className="flex flex-col sm:flex-row gap-3">
              <select
                value={newRoundId}
                onChange={(e) => setNewRoundId(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-kayan-500"
              >
                <option value="">Select round...</option>
                {rounds.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>

              <input
                type="number"
                placeholder="Token amount"
                value={newTokenAmount}
                onChange={(e) => setNewTokenAmount(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-kayan-500"
              />

              <Button
                onClick={handleAddAllocation}
                disabled={!newRoundId || !newTokenAmount}
                size="md"
              >
                Add
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
