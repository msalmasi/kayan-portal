"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useAdminRole } from "@/lib/hooks";
import { Card, CardHeader } from "@/components/ui/Card";
import { KycBadge, PqBadge, PaymentBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatTokenAmount } from "@/lib/vesting";

// ─── Types ──────────────────────────────────────────────────

interface InvestorRow {
  id: string;
  email: string;
  full_name: string;
  kyc_status: string;
  pq_status: string;
  total_tokens: number;
  round_count: number;
  pending_allocations: number;
  payment_summary: string;
  doc_status: "none" | "pending" | "signed";
  action_needed: boolean;
  action_reasons: string[];
  created_at: string;
}

type SortCol =
  | "full_name"
  | "email"
  | "kyc_status"
  | "pq_status"
  | "payment_summary"
  | "total_tokens"
  | "doc_status"
  | "action_needed"
  | "created_at";
type SortDir = "asc" | "desc";

// ─── Filter options ─────────────────────────────────────────

const KYC_OPTIONS = [
  { value: "", label: "All KYC" },
  { value: "unverified", label: "Unverified" },
  { value: "pending", label: "Pending" },
  { value: "verified", label: "Verified" },
];

const PQ_OPTIONS = [
  { value: "", label: "All PQ" },
  { value: "not_sent", label: "Not Sent" },
  { value: "sent", label: "Sent" },
  { value: "submitted", label: "Submitted" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

const PAYMENT_OPTIONS = [
  { value: "", label: "All Payments" },
  { value: "unpaid", label: "Unpaid" },
  { value: "invoiced", label: "Invoiced" },
  { value: "partial", label: "Partial" },
  { value: "paid", label: "Paid" },
  { value: "grant", label: "Grant" },
];

const DOCS_OPTIONS = [
  { value: "", label: "All Docs" },
  { value: "none", label: "No Docs" },
  { value: "pending", label: "Unsigned" },
  { value: "signed", label: "Signed" },
];

const ACTION_OPTIONS = [
  { value: "", label: "All" },
  { value: "true", label: "Action Needed" },
];

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

// ─── Shared styles ──────────────────────────────────────────

const selectCls =
  "px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-kayan-500 text-gray-700";

// ─── Doc status badge ───────────────────────────────────────

function DocBadge({ status }: { status: string }) {
  if (status === "signed") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
        Signed
      </span>
    );
  }
  if (status === "pending") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
        Unsigned
      </span>
    );
  }
  return <span className="text-xs text-gray-300">—</span>;
}

// ─── Sort header component ──────────────────────────────────

function SortHeader({
  label,
  column,
  current,
  dir,
  onSort,
  align = "left",
}: {
  label: string;
  column: SortCol;
  current: SortCol;
  dir: SortDir;
  onSort: (col: SortCol) => void;
  align?: "left" | "center" | "right";
}) {
  const active = current === column;
  const alignCls =
    align === "right"
      ? "text-right justify-end"
      : align === "center"
      ? "text-center justify-center"
      : "text-left";

  return (
    <th className={`py-3 px-2 font-medium text-gray-500 ${alignCls}`}>
      <button
        onClick={() => onSort(column)}
        className={`inline-flex items-center gap-1 hover:text-gray-800 transition-colors ${
          active ? "text-gray-800" : ""
        }`}
      >
        {label}
        <span className="text-xs">
          {active ? (dir === "asc" ? "↑" : "↓") : "⇅"}
        </span>
      </button>
    </th>
  );
}

// ─── Main Page ──────────────────────────────────────────────

export default function AdminInvestorsPage() {
  const { canWrite } = useAdminRole();
  const searchRef = useRef<HTMLInputElement>(null);

  // Data state
  const [investors, setInvestors] = useState<InvestorRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // Search + filters
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [kycFilter, setKycFilter] = useState("");
  const [pqFilter, setPqFilter] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("");
  const [docsFilter, setDocsFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");

  // Sort
  const [sortBy, setSortBy] = useState<SortCol>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Pagination
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);

  // Add investor form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [addingSaving, setAddingSaving] = useState(false);

  // Export loading
  const [exporting, setExporting] = useState(false);

  // ── Debounce search ──
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // ── Keyboard shortcut: / to focus search ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ── Fetch investors ──
  const fetchInvestors = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      search: debouncedSearch,
      page: String(page),
      limit: String(pageSize),
      sort_by: sortBy,
      sort_dir: sortDir,
    });
    if (kycFilter) params.set("kyc", kycFilter);
    if (pqFilter) params.set("pq", pqFilter);
    if (paymentFilter) params.set("payment", paymentFilter);
    if (docsFilter) params.set("docs", docsFilter);
    if (actionFilter) params.set("action", actionFilter);

    const res = await fetch(`/api/admin/investors?${params}`);
    const data = await res.json();
    setInvestors(data.investors || []);
    setTotal(data.total || 0);
    setLoading(false);
  }, [debouncedSearch, page, pageSize, sortBy, sortDir, kycFilter, pqFilter, paymentFilter, docsFilter, actionFilter]);

  useEffect(() => {
    fetchInvestors();
  }, [fetchInvestors]);

  // Reset to page 0 when filters/search/sort change
  useEffect(() => {
    setPage(0);
  }, [debouncedSearch, kycFilter, pqFilter, paymentFilter, docsFilter, actionFilter, sortBy, sortDir, pageSize]);

  // ── Sort handler ──
  const handleSort = (col: SortCol) => {
    if (sortBy === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(col);
      setSortDir(col === "total_tokens" || col === "created_at" ? "desc" : "asc");
    }
  };

  // ── Clear all filters ──
  const hasActiveFilters = kycFilter || pqFilter || paymentFilter || docsFilter || actionFilter || debouncedSearch;
  const clearFilters = () => {
    setSearch("");
    setKycFilter("");
    setPqFilter("");
    setPaymentFilter("");
    setDocsFilter("");
    setActionFilter("");
  };

  // ── CSV Export ──
  const handleExport = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams({
        search: debouncedSearch,
        sort_by: sortBy,
        sort_dir: sortDir,
        export: "csv",
      });
      if (kycFilter) params.set("kyc", kycFilter);
      if (pqFilter) params.set("pq", pqFilter);
      if (paymentFilter) params.set("payment", paymentFilter);
      if (docsFilter) params.set("docs", docsFilter);
      if (actionFilter) params.set("action", actionFilter);

      const res = await fetch(`/api/admin/investors?${params}`);
      if (!res.ok) throw new Error("Export failed");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `investors-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("CSV exported");
    } catch {
      toast.error("Export failed");
    } finally {
      setExporting(false);
    }
  };

  // ── Add investor ──
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

  // ── Pagination math ──
  const totalPages = Math.ceil(total / pageSize);
  const startRow = total === 0 ? 0 : page * pageSize + 1;
  const endRow = Math.min((page + 1) * pageSize, total);

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Investors</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage investors, allocations, and KYC status
          </p>
        </div>

        <div className="flex gap-2 flex-wrap">
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
                <Button variant="secondary" size="sm">Manage Rounds</Button>
              </Link>
              <Link href="/admin/import">
                <Button variant="primary" size="sm">Import CSV</Button>
              </Link>
            </>
          )}
          {!canWrite && (
            <Link href="/admin/rounds">
              <Button variant="secondary" size="sm">View Rounds</Button>
            </Link>
          )}
        </div>
      </div>

      {/* ── Add Investor Form ── */}
      {showAddForm && (
        <Card>
          <CardHeader title="Add Investor" subtitle="Manually create a new investor record" />
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-600 mb-1">Full Name *</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Jane Doe"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-kayan-500"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-600 mb-1">Email *</label>
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="jane@example.com"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-kayan-500"
              />
            </div>
            <div className="flex items-end">
              <Button onClick={handleAddInvestor} loading={addingSaving} disabled={!newEmail || !newName}>
                Create
              </Button>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-3">
            After creating the investor, you can add allocations from their detail page.
          </p>
        </Card>
      )}

      {/* ── Investor List Card ── */}
      <Card>
        {/* ── Search + Filters toolbar ── */}
        <div className="space-y-3 mb-4">
          {/* Row 1: Search + Export + Page size */}
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            <div className="relative flex-1 max-w-sm">
              <input
                ref={searchRef}
                type="text"
                placeholder="Search by name or email...  ( / )"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full px-3 py-2 pl-9 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-kayan-500 focus:border-transparent placeholder:text-gray-400"
              />
              <svg
                className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2"
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
            </div>

            <div className="flex gap-2 items-center ml-auto">
              <label className="text-xs text-gray-500">Show</label>
              <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className={selectCls}>
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
              <Button variant="secondary" size="sm" onClick={handleExport} disabled={exporting}>
                {exporting ? "Exporting..." : "Export CSV"}
              </Button>
            </div>
          </div>

          {/* Row 2: Filter dropdowns */}
          <div className="flex flex-wrap gap-2 items-center">
            <select value={kycFilter} onChange={(e) => setKycFilter(e.target.value)} className={selectCls}>
              {KYC_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select value={pqFilter} onChange={(e) => setPqFilter(e.target.value)} className={selectCls}>
              {PQ_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value)} className={selectCls}>
              {PAYMENT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select value={docsFilter} onChange={(e) => setDocsFilter(e.target.value)} className={selectCls}>
              {DOCS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} className={selectCls}>
              {ACTION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>

            {hasActiveFilters && (
              <button onClick={clearFilters} className="text-xs text-gray-500 hover:text-gray-700 underline ml-1">
                Clear filters
              </button>
            )}
            <span className="text-xs text-gray-400 ml-auto">
              {total} result{total !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        {/* ── Table ── */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <SortHeader label="Name"    column="full_name"       current={sortBy} dir={sortDir} onSort={handleSort} />
                <SortHeader label="KYC"     column="kyc_status"      current={sortBy} dir={sortDir} onSort={handleSort} align="center" />
                <SortHeader label="PQ"      column="pq_status"       current={sortBy} dir={sortDir} onSort={handleSort} align="center" />
                <SortHeader label="Payment" column="payment_summary" current={sortBy} dir={sortDir} onSort={handleSort} align="center" />
                <SortHeader label="Docs"    column="doc_status"      current={sortBy} dir={sortDir} onSort={handleSort} align="center" />
                <SortHeader label="Tokens"  column="total_tokens"    current={sortBy} dir={sortDir} onSort={handleSort} align="right" />
                <SortHeader label="Action"  column="action_needed"   current={sortBy} dir={sortDir} onSort={handleSort} align="center" />
                <SortHeader label="Added"   column="created_at"      current={sortBy} dir={sortDir} onSort={handleSort} align="right" />
                <th className="text-right py-3 px-2 font-medium text-gray-500"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: Math.min(pageSize, 5) }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    {Array.from({ length: 9 }).map((_, j) => (
                      <td key={j} className="py-3 px-2">
                        <div className="h-4 bg-gray-100 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : investors.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-gray-400">
                    {hasActiveFilters ? "No investors match your filters" : "No investors yet"}
                  </td>
                </tr>
              ) : (
                investors.map((inv) => (
                  <tr
                    key={inv.id}
                    className={`border-b border-gray-50 last:border-0 hover:bg-gray-50/50 group ${
                      inv.action_needed ? "bg-amber-50/30" : ""
                    }`}
                  >
                    {/* Name + email (stacked) */}
                    <td className="py-3 px-2">
                      <Link href={`/admin/investors/${inv.id}`} className="font-medium text-gray-900 hover:text-kayan-600">
                        {inv.full_name}
                      </Link>
                      <p className="text-xs text-gray-400 mt-0.5">{inv.email}</p>
                    </td>
                    <td className="py-3 px-2 text-center"><KycBadge status={inv.kyc_status} /></td>
                    <td className="py-3 px-2 text-center"><PqBadge status={inv.pq_status} /></td>
                    <td className="py-3 px-2 text-center">
                      {inv.payment_summary !== "none" ? (
                        <PaymentBadge status={inv.payment_summary} />
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                    <td className="py-3 px-2 text-center">
                      <DocBadge status={inv.doc_status} />
                    </td>
                    <td className="py-3 px-2 text-right text-gray-700">
                      {formatTokenAmount(inv.total_tokens)}
                      {inv.pending_allocations > 0 && (
                        <span className="ml-1 text-[10px] font-medium text-amber-600">
                          +{inv.pending_allocations}?
                        </span>
                      )}
                    </td>
                    {/* Action needed */}
                    <td className="py-3 px-2 text-center">
                      {inv.action_needed ? (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 cursor-help"
                          title={inv.action_reasons.join("\n")}
                        >
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                          </svg>
                          {inv.action_reasons.length}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                    <td className="py-3 px-2 text-right text-xs text-gray-400">
                      {new Date(inv.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-2 text-right">
                      <Link
                        href={`/admin/investors/${inv.id}`}
                        className="text-kayan-500 hover:text-kayan-600 text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        →
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ── Pagination ── */}
        <div className="flex flex-col sm:flex-row items-center justify-between mt-4 pt-4 border-t border-gray-100 gap-3">
          <p className="text-sm text-gray-500">
            {total > 0 ? (
              <>Showing <span className="font-medium">{startRow}–{endRow}</span> of <span className="font-medium">{total}</span></>
            ) : (
              "No results"
            )}
          </p>

          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button disabled={page === 0} onClick={() => setPage(0)}
                className="px-2 py-1 text-xs rounded border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed" title="First page">
                ««
              </button>
              <button disabled={page === 0} onClick={() => setPage((p) => p - 1)}
                className="px-2 py-1 text-xs rounded border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed">
                ‹ Prev
              </button>
              {(() => {
                const pages: number[] = [];
                const start = Math.max(0, page - 2);
                const end = Math.min(totalPages - 1, page + 2);
                for (let i = start; i <= end; i++) pages.push(i);
                return pages.map((p) => (
                  <button key={p} onClick={() => setPage(p)}
                    className={`px-2.5 py-1 text-xs rounded border ${
                      p === page ? "bg-kayan-600 text-white border-kayan-600" : "border-gray-200 text-gray-600 hover:bg-gray-50"
                    }`}>
                    {p + 1}
                  </button>
                ));
              })()}
              <button disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}
                className="px-2 py-1 text-xs rounded border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed">
                Next ›
              </button>
              <button disabled={page >= totalPages - 1} onClick={() => setPage(totalPages - 1)}
                className="px-2 py-1 text-xs rounded border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed" title="Last page">
                »»
              </button>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
