"use client";

import { useState, useEffect, useCallback, useMemo, Fragment } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { KycBadge, PqBadge } from "@/components/ui/Badge";
import Link from "next/link";
import {
  PieChart, Pie, Cell,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";

// ── Colors ──
const ROUND_COLORS = [
  "#1a3c2a", "#2d6a4f", "#40916c", "#52b788",
  "#74c69d", "#95d5b2", "#b7e4c7", "#d8f3dc",
];
const RESERVED_COLOR = "#6b7280";
const AVAILABLE_COLOR = "#e5e7eb";

// ── Format helpers ──
const fmt = (n: number) => n.toLocaleString();
const fmtUsd = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const fmtPct = (n: number) => `${n.toFixed(2)}%`;

// ── Types ──

interface RoundData {
  id: string; name: string; token_price: number | null;
  tokens_allocated: number; pct_of_supply: number;
  investor_count: number; capital_due: number; capital_received: number;
  tge_unlock_pct: number; cliff_months: number; vesting_months: number;
  closing_date: string | null;
}

interface VestingPoint { month: number; total_unlocked: number; per_round: Record<string, number>; }

interface SummaryData {
  total_supply: number; reserved_tokens: number;
  tge_date: string | null; token_ticker: string;
  total_allocated: number; total_available: number;
  total_capital_due: number; total_capital_received: number;
  investor_count: number;
  rounds: RoundData[];
  vesting_schedule: VestingPoint[];
}

interface InvestorAlloc {
  id: string; round_name: string; round_id: string;
  token_amount: number; amount_usd: number; amount_received_usd: number;
  payment_status: string;
}

interface InvestorRow {
  id: string; full_name: string; email: string;
  kyc_status: string; pq_status: string;
  total_tokens: number; pct_ownership: number;
  total_usd_due: number; total_usd_received: number;
  payment_summary: string; has_grant: boolean;
  allocations: InvestorAlloc[];
}

type ViewMode = "all" | "confirmed" | "pending";
type SortKey = "tokens" | "pct" | "due" | "received" | "name";

const PAGE_SIZES = [25, 50, 100];

// ── Stat Card ──

function StatCard({ label, value, sub, pct, color }: {
  label: string; value: string; sub?: string; pct?: number; color?: string;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <p className="text-[11px] text-gray-500 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      {pct !== undefined && (
        <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color || "#1a3c2a" }} />
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════

export default function CapTablePage() {
  // Summary data (loads once)
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  // Investor pagination
  const [investors, setInvestors] = useState<InvestorRow[]>([]);
  const [investorTotal, setInvestorTotal] = useState(0);
  const [investorTotals, setInvestorTotals] = useState({ tokens: 0, pct: 0, due: 0, received: 0 });
  const [investorLoading, setInvestorLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);

  // Filters & sort
  const [viewMode, setViewMode] = useState<ViewMode>("all");
  const [roundFilter, setRoundFilter] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("tokens");
  const [sortAsc, setSortAsc] = useState(false);
  const [expandedInvestor, setExpandedInvestor] = useState<string | null>(null);
  const [showVesting, setShowVesting] = useState(false);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(0); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  // Reset page on filter changes
  useEffect(() => { setPage(0); }, [viewMode, roundFilter, pageSize]);

  // ── Load summary (once) ──
  useEffect(() => {
    fetch("/api/admin/cap-table")
      .then((r) => r.json())
      .then(setSummary)
      .finally(() => setSummaryLoading(false));
  }, []);

  // ── Load investor page ──
  const fetchInvestors = useCallback(async () => {
    setInvestorLoading(true);
    const params = new URLSearchParams({
      investors: "true",
      page: String(page),
      limit: String(pageSize),
      sort: sortKey,
      dir: sortAsc ? "asc" : "desc",
    });
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (roundFilter) params.set("round", roundFilter);
    if (viewMode !== "all") params.set("view", viewMode);

    const res = await fetch(`/api/admin/cap-table?${params}`);
    if (res.ok) {
      const data = await res.json();
      setInvestors(data.investors || []);
      setInvestorTotal(data.total || 0);
      setInvestorTotals(data.totals || { tokens: 0, pct: 0, due: 0, received: 0 });
    }
    setInvestorLoading(false);
  }, [page, pageSize, sortKey, sortAsc, debouncedSearch, roundFilter, viewMode]);

  useEffect(() => { fetchInvestors(); }, [fetchInvestors]);

  // ── Donut data ──
  const donutData = useMemo(() => {
    if (!summary) return [];
    const slices: { name: string; value: number; color: string }[] = [];
    summary.rounds.forEach((r, i) => {
      if (r.tokens_allocated > 0) {
        slices.push({ name: r.name, value: r.tokens_allocated, color: ROUND_COLORS[i % ROUND_COLORS.length] });
      }
    });
    if (summary.reserved_tokens > 0) slices.push({ name: "Reserved", value: summary.reserved_tokens, color: RESERVED_COLOR });
    if (summary.total_available > 0) slices.push({ name: "Available", value: summary.total_available, color: AVAILABLE_COLOR });
    return slices;
  }, [summary]);

  // ── Vesting chart data ──
  const vestingChartData = useMemo(() => {
    if (!summary) return [];
    return summary.vesting_schedule.map((v) => ({
      month: v.month === 0 ? "TGE" : `M${v.month}`,
      ...v.per_round,
      total: v.total_unlocked,
    }));
  }, [summary]);

  // ── Sort header helper ──
  const SortTh = ({ label, sk, align }: { label: string; sk: SortKey; align?: string }) => (
    <th
      className={`py-2.5 px-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none ${align || "text-left"}`}
      onClick={() => { if (sortKey === sk) setSortAsc(!sortAsc); else { setSortKey(sk); setSortAsc(false); } }}
    >
      {label}{sortKey === sk ? (sortAsc ? " ↑" : " ↓") : ""}
    </th>
  );

  // Pagination
  const totalPages = Math.ceil(investorTotal / pageSize);

  if (summaryLoading) return <div className="flex items-center justify-center min-h-[40vh]"><p className="text-gray-400">Loading cap table…</p></div>;
  if (!summary) return <div className="text-center py-12 text-gray-400">Failed to load cap table</div>;

  const ticker = summary.token_ticker;

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cap Table</h1>
          <p className="text-sm text-gray-500 mt-1">
            Token ownership across {summary.rounds.length} round{summary.rounds.length !== 1 ? "s" : ""} · {summary.investor_count} investor{summary.investor_count !== 1 ? "s" : ""}
          </p>
        </div>
        <a
          href="/api/admin/export?type=cap_table"
          download
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
        >
          ↓ Export CSV
        </a>
      </div>

      {/* ═══ SUMMARY CARDS ═══ */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard label="Total Supply" value={fmt(summary.total_supply)} sub={ticker} />
        <StatCard label="Allocated" value={fmt(summary.total_allocated)} sub={fmtPct((summary.total_allocated / summary.total_supply) * 100)} pct={(summary.total_allocated / summary.total_supply) * 100} color="#1a3c2a" />
        <StatCard label="Reserved" value={fmt(summary.reserved_tokens)} sub={summary.reserved_tokens > 0 ? fmtPct((summary.reserved_tokens / summary.total_supply) * 100) : "Not set"} pct={(summary.reserved_tokens / summary.total_supply) * 100} color="#6b7280" />
        <StatCard label="Available" value={fmt(summary.total_available)} sub={fmtPct((summary.total_available / summary.total_supply) * 100)} pct={(summary.total_available / summary.total_supply) * 100} color="#52b788" />
        <StatCard label="Capital Raised" value={fmtUsd(summary.total_capital_received)} sub={summary.total_capital_due > 0 ? `of ${fmtUsd(summary.total_capital_due)} due` : "No capital due"} />
      </div>

      {/* ═══ ROUND BREAKDOWN ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader title="Round Breakdown" subtitle="Per-round allocation and capital collection" />
          <div className="overflow-x-auto -mx-5 px-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="py-2 px-2 text-left text-[11px] font-semibold text-gray-500 uppercase">Round</th>
                  <th className="py-2 px-2 text-right text-[11px] font-semibold text-gray-500 uppercase">Price</th>
                  <th className="py-2 px-2 text-right text-[11px] font-semibold text-gray-500 uppercase">Tokens</th>
                  <th className="py-2 px-2 text-right text-[11px] font-semibold text-gray-500 uppercase">% Supply</th>
                  <th className="py-2 px-2 text-right text-[11px] font-semibold text-gray-500 uppercase">Investors</th>
                  <th className="py-2 px-2 text-right text-[11px] font-semibold text-gray-500 uppercase">Received</th>
                  <th className="py-2 px-2 text-right text-[11px] font-semibold text-gray-500 uppercase">Vesting</th>
                </tr>
              </thead>
              <tbody>
                {summary.rounds.map((r, i) => (
                  <tr key={r.id} className="border-b border-gray-50 last:border-0">
                    <td className="py-2.5 px-2">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: ROUND_COLORS[i % ROUND_COLORS.length] }} />
                        <span className="font-medium text-gray-900">{r.name}</span>
                        {r.closing_date && new Date(r.closing_date) < new Date() && (
                          <span className="text-[9px] px-1 py-0.5 bg-gray-100 text-gray-500 rounded">Closed</span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-2 text-right text-gray-700">{r.token_price ? `$${r.token_price}` : "—"}</td>
                    <td className="py-2.5 px-2 text-right font-medium text-gray-900">{fmt(r.tokens_allocated)}</td>
                    <td className="py-2.5 px-2 text-right text-gray-600">{fmtPct(r.pct_of_supply)}</td>
                    <td className="py-2.5 px-2 text-right text-gray-600">{r.investor_count}</td>
                    <td className="py-2.5 px-2 text-right text-gray-600">
                      {r.capital_due > 0 ? <span>{fmtUsd(r.capital_received)} <span className="text-gray-400">/ {fmtUsd(r.capital_due)}</span></span> : "Grant"}
                    </td>
                    <td className="py-2.5 px-2 text-right text-gray-500 text-xs">{r.tge_unlock_pct}% · {r.cliff_months}mo · {r.vesting_months}mo</td>
                  </tr>
                ))}
                {summary.rounds.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-gray-400">No rounds configured</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Donut */}
        <Card>
          <CardHeader title="Distribution" subtitle="% of total supply" />
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={donutData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius="55%" outerRadius="85%" paddingAngle={1}>
                  {donutData.map((d, i) => <Cell key={i} fill={d.color} stroke="white" strokeWidth={2} />)}
                </Pie>
                <Tooltip formatter={(value: number) => [fmt(value), "Tokens"]} contentStyle={{ fontSize: "12px", borderRadius: "8px", border: "1px solid #e5e7eb" }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center mt-1">
            {donutData.map((d) => (
              <div key={d.name} className="flex items-center gap-1.5 text-[10px] text-gray-500">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                {d.name}
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* ═══ INVESTOR OWNERSHIP TABLE ═══ */}
      <Card>
        <CardHeader title="Investor Ownership" subtitle="Per-investor token allocation and payment status" />

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="inline-flex rounded-lg border border-gray-200 text-xs overflow-hidden">
            {(["all", "confirmed", "pending"] as ViewMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setViewMode(m)}
                className={`px-3 py-1.5 capitalize transition-colors ${viewMode === m ? "bg-brand-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
              >
                {m}
              </button>
            ))}
          </div>

          <select
            value={roundFilter}
            onChange={(e) => setRoundFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-200"
          >
            <option value="">All Rounds</option>
            {summary.rounds.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>

          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search investors…"
            className="px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-200 w-48"
          />

          <div className="flex items-center gap-2 ml-auto">
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white"
            >
              {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}/page</option>)}
            </select>
            <span className="text-[11px] text-gray-400">
              {investorTotal} investor{investorTotal !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto -mx-5 px-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <SortTh label="Investor" sk="name" />
                <th className="py-2.5 px-2 text-left text-[11px] font-semibold text-gray-500 uppercase">Round(s)</th>
                <SortTh label="Tokens" sk="tokens" align="text-right" />
                <SortTh label="% Own" sk="pct" align="text-right" />
                <SortTh label="USD Due" sk="due" align="text-right" />
                <SortTh label="USD Paid" sk="received" align="text-right" />
                <th className="py-2.5 px-2 text-center text-[11px] font-semibold text-gray-500 uppercase">Status</th>
                <th className="py-2.5 px-2 text-center text-[11px] font-semibold text-gray-500 uppercase">KYC</th>
                <th className="py-2.5 px-2 text-center text-[11px] font-semibold text-gray-500 uppercase">PQ</th>
              </tr>
            </thead>
            <tbody>
              {investorLoading ? (
                <tr><td colSpan={9} className="py-12 text-center text-gray-400">Loading…</td></tr>
              ) : investors.length === 0 ? (
                <tr><td colSpan={9} className="py-12 text-center text-gray-400">No matching investors</td></tr>
              ) : investors.map((inv) => (
                <Fragment key={inv.id}>
                  <tr
                    className="border-b border-gray-50 hover:bg-gray-50/50 cursor-pointer"
                    onClick={() => setExpandedInvestor(expandedInvestor === inv.id ? null : inv.id)}
                  >
                    <td className="py-2.5 px-2">
                      <Link href={`/admin/investors/${inv.id}`} className="font-medium text-gray-900 hover:text-brand-700" onClick={(e) => e.stopPropagation()}>
                        {inv.full_name}
                      </Link>
                      <p className="text-[11px] text-gray-400">{inv.email}</p>
                    </td>
                    <td className="py-2.5 px-2 text-xs text-gray-600">
                      {inv.allocations.map((a) => a.round_name).filter((v, i, arr) => arr.indexOf(v) === i).join(", ")}
                    </td>
                    <td className="py-2.5 px-2 text-right font-medium text-gray-900">{fmt(inv.total_tokens)}</td>
                    <td className="py-2.5 px-2 text-right text-gray-600">{fmtPct(inv.pct_ownership)}</td>
                    <td className="py-2.5 px-2 text-right text-gray-600">{inv.total_usd_due > 0 ? fmtUsd(inv.total_usd_due) : "—"}</td>
                    <td className="py-2.5 px-2 text-right text-gray-600">{inv.total_usd_received > 0 ? fmtUsd(inv.total_usd_received) : "—"}</td>
                    <td className="py-2.5 px-2 text-center">
                      <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        inv.payment_summary === "paid" ? "bg-emerald-100 text-emerald-700" :
                        inv.payment_summary === "grant" ? "bg-purple-100 text-purple-700" :
                        inv.payment_summary === "partial" || inv.payment_summary === "mixed" ? "bg-amber-100 text-amber-700" :
                        "bg-gray-100 text-gray-600"
                      }`}>
                        {inv.has_grant && inv.payment_summary !== "grant" ? `${inv.payment_summary} + grant` : inv.payment_summary}
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-center"><KycBadge status={inv.kyc_status} /></td>
                    <td className="py-2.5 px-2 text-center"><PqBadge status={inv.pq_status} /></td>
                  </tr>

                  {expandedInvestor === inv.id && (
                    <tr>
                      <td colSpan={9} className="bg-gray-50/70 px-6 py-3">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-gray-400">
                              <th className="py-1 text-left font-medium">Round</th>
                              <th className="py-1 text-right font-medium">Tokens</th>
                              <th className="py-1 text-right font-medium">USD Due</th>
                              <th className="py-1 text-right font-medium">USD Paid</th>
                              <th className="py-1 text-center font-medium">Payment</th>
                            </tr>
                          </thead>
                          <tbody>
                            {inv.allocations.map((a) => (
                              <tr key={a.id} className="text-gray-600">
                                <td className="py-1">{a.round_name}</td>
                                <td className="py-1 text-right">{fmt(a.token_amount)}</td>
                                <td className="py-1 text-right">{a.amount_usd > 0 ? fmtUsd(a.amount_usd) : "—"}</td>
                                <td className="py-1 text-right">{a.amount_received_usd > 0 ? fmtUsd(a.amount_received_usd) : "—"}</td>
                                <td className="py-1 text-center capitalize">{a.payment_status}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}

              {/* Totals row */}
              {!investorLoading && investors.length > 0 && (
                <tr className="border-t-2 border-gray-200 font-semibold text-gray-900">
                  <td className="py-3 px-2">Total {investorTotal > investors.length ? `(all ${investorTotal})` : ""}</td>
                  <td className="py-3 px-2" />
                  <td className="py-3 px-2 text-right">{fmt(investorTotals.tokens)}</td>
                  <td className="py-3 px-2 text-right">{fmtPct(investorTotals.pct)}</td>
                  <td className="py-3 px-2 text-right">{fmtUsd(investorTotals.due)}</td>
                  <td className="py-3 px-2 text-right">{fmtUsd(investorTotals.received)}</td>
                  <td colSpan={3} />
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
            <p className="text-[11px] text-gray-400">
              Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, investorTotal)} of {investorTotal}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(0)}
                disabled={page === 0}
                className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                ««
              </button>
              <button
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
                className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                ‹ Prev
              </button>
              <span className="px-3 py-1 text-xs text-gray-700 font-medium">
                {page + 1} / {totalPages}
              </span>
              <button
                onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                disabled={page >= totalPages - 1}
                className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Next ›
              </button>
              <button
                onClick={() => setPage(totalPages - 1)}
                disabled={page >= totalPages - 1}
                className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                »»
              </button>
            </div>
          </div>
        )}
      </Card>

      {/* ═══ VESTING TIMELINE ═══ */}
      <Card>
        <div className="flex items-center justify-between">
          <CardHeader
            title="Vesting Timeline"
            subtitle={summary.tge_date
              ? `Projected token unlocks from TGE (${new Date(summary.tge_date).toLocaleDateString()})`
              : "Projected token unlocks from TGE"
            }
          />
          <Button variant="ghost" size="sm" onClick={() => setShowVesting(!showVesting)} className="text-xs">
            {showVesting ? "Hide" : "Show"} Chart
          </Button>
        </div>

        {showVesting && vestingChartData.length > 0 && (
          <div className="h-72 mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={vestingChartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                <YAxis tickFormatter={(v) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v} tick={{ fontSize: 11 }} stroke="#9ca3af" />
                <Tooltip
                  formatter={(value: number, name: string) => {
                    const round = summary.rounds.find((r) => r.id === name);
                    return [fmt(Math.round(value)), round?.name || name];
                  }}
                  contentStyle={{ fontSize: "12px", borderRadius: "8px", border: "1px solid #e5e7eb" }}
                />
                <Legend formatter={(value) => { const r = summary.rounds.find((r) => r.id === value); return r?.name || value; }} wrapperStyle={{ fontSize: "11px" }} />
                {summary.rounds.map((r, i) => (
                  <Area key={r.id} type="monotone" dataKey={r.id} stackId="1" fill={ROUND_COLORS[i % ROUND_COLORS.length]} stroke={ROUND_COLORS[i % ROUND_COLORS.length]} fillOpacity={0.7} />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {showVesting && vestingChartData.length === 0 && (
          <p className="text-xs text-gray-400 py-4 text-center">No vesting data — add rounds and allocations first</p>
        )}
      </Card>
    </div>
  );
}
