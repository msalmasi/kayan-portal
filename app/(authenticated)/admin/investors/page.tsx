"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase";
import { useAdminRole } from "@/lib/hooks";
import { Card, CardHeader } from "@/components/ui/Card";
import { KycBadge, PqBadge, PaymentBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatTokenAmount } from "@/lib/vesting";

interface InvestorRow {
  id: string;
  email: string;
  full_name: string;
  kyc_status: string;
  pq_status: string;
  total_tokens: number;
  round_count: number;
  payment_summary: string;
}

const PAGE_SIZE = 20;

/**
 * /admin — Main admin panel
 *
 * Shows a searchable, paginated list of all investors.
 * Uses the client-side Supabase client — but this page is only
 * accessible to admin users (enforced by the admin layout).
 *
 * Note: Admin reads still go through RLS, so we use an API route
 * with the service role key for the actual data fetching.
 */
export default function AdminPage() {
  const { canWrite } = useAdminRole();
  const [investors, setInvestors] = useState<InvestorRow[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // Add investor form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [addingSaving, setAddingSaving] = useState(false);

  const fetchInvestors = useCallback(async () => {
    setLoading(true);
    const res = await fetch(
      `/api/admin/investors?search=${encodeURIComponent(search)}&page=${page}&limit=${PAGE_SIZE}`
    );
    const data = await res.json();
    setInvestors(data.investors || []);
    setTotal(data.total || 0);
    setLoading(false);
  }, [search, page]);

  useEffect(() => {
    fetchInvestors();
  }, [fetchInvestors]);

  // Reset to first page when search changes
  useEffect(() => {
    setPage(0);
  }, [search]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  /** Create a new investor manually */
  const handleAddInvestor = async () => {
    if (!newEmail || !newName) return;
    setAddingSaving(true);

    const res = await fetch("/api/admin/investors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: newEmail, full_name: newName }),
    });

    setAddingSaving(false);

    if (res.ok) {
      const result = await res.json();
      const emailNote = result.welcome_email_sent
        ? " — welcome email sent"
        : " — welcome email logged (configure RESEND_API_KEY to enable)";
      toast.success(`Added investor ${newName}${emailNote}`);
      setNewEmail("");
      setNewName("");
      setShowAddForm(false);
      fetchInvestors();
    } else {
      const err = await res.json();
      toast.error(err.error || "Failed to add investor");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with action buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Admin Panel</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage investors, rounds, and allocations
          </p>
        </div>

        <div className="flex gap-2 flex-wrap">
          {/* All admin roles (including staff) can add investors */}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowAddForm(!showAddForm)}
          >
            {showAddForm ? "Cancel" : "Add Investor"}
          </Button>
          {canWrite && (
            <>
              <Link href="/admin/rounds">
                <Button variant="secondary" size="sm">
                  Manage Rounds
                </Button>
              </Link>
              <Link href="/admin/import">
                <Button variant="primary" size="sm">
                  Import CSV
                </Button>
              </Link>
            </>
          )}
          {!canWrite && (
            <Link href="/admin/rounds">
              <Button variant="secondary" size="sm">
                View Rounds
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Add Investor Form */}
      {showAddForm && (
        <Card>
          <CardHeader
            title="Add Investor"
            subtitle="Manually create a new investor record"
          />
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Full Name *
              </label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Jane Doe"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-kayan-500"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Email *
              </label>
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="jane@example.com"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-kayan-500"
              />
            </div>
            <div className="flex items-end">
              <Button
                onClick={handleAddInvestor}
                loading={addingSaving}
                disabled={!newEmail || !newName}
              >
                Create
              </Button>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-3">
            After creating the investor, you can add allocations from their
            detail page.
          </p>
        </Card>
      )}

      {/* Investor List */}
      <Card>
        <CardHeader
          title="Investors"
          subtitle={`${total} total investor${total !== 1 ? "s" : ""}`}
        />

        {/* Search */}
        <div className="mb-4">
          <input
            type="text"
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-80 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-kayan-500 focus:border-transparent placeholder:text-gray-400"
          />
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-3 px-2 font-medium text-gray-500">
                  Name
                </th>
                <th className="text-left py-3 px-2 font-medium text-gray-500">
                  Email
                </th>
                <th className="text-center py-3 px-2 font-medium text-gray-500">
                  KYC
                </th>
                <th className="text-center py-3 px-2 font-medium text-gray-500">
                  PQ
                </th>
                <th className="text-center py-3 px-2 font-medium text-gray-500">
                  Payment
                </th>
                <th className="text-right py-3 px-2 font-medium text-gray-500">
                  Tokens
                </th>
                <th className="text-right py-3 px-2 font-medium text-gray-500">
                  
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-gray-400">
                    Loading...
                  </td>
                </tr>
              ) : investors.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-gray-400">
                    {search ? "No investors match your search" : "No investors yet"}
                  </td>
                </tr>
              ) : (
                investors.map((inv) => (
                  <tr
                    key={inv.id}
                    className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50"
                  >
                    <td className="py-3 px-2 font-medium text-gray-900">
                      {inv.full_name}
                    </td>
                    <td className="py-3 px-2 text-gray-600">{inv.email}</td>
                    <td className="py-3 px-2 text-center">
                      <KycBadge status={inv.kyc_status} />
                    </td>
                    <td className="py-3 px-2 text-center">
                      <PqBadge status={inv.pq_status} />
                    </td>
                    <td className="py-3 px-2 text-center">
                      {inv.payment_summary !== "none" ? (
                        <PaymentBadge status={inv.payment_summary} />
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                    <td className="py-3 px-2 text-right text-gray-700">
                      {formatTokenAmount(inv.total_tokens)}
                    </td>
                    <td className="py-3 px-2 text-right">
                      <Link
                        href={`/admin/investors/${inv.id}`}
                        className="text-kayan-500 hover:text-kayan-600 text-sm font-medium"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
            <p className="text-sm text-gray-500">
              Page {page + 1} of {totalPages}
            </p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
