"use client";

import { useState, useEffect, useMemo, Fragment } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { KycBadge, PqBadge } from "@/components/ui/Badge";
import Link from "next/link";
import {
  PieChart, Pie, Cell,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";

// ── Colors for rounds (cycles if more than 8) ──
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

// ── Types matching API response ──
interface RoundData {
  id: string; name: string; token_price: number | null;
  tokens_allocated: number; pct_of_supply: number;
  investor_count: number; capital_due: number; capital_received: number;
  tge_unlock_pct: number; cliff_months: number; vesting_months: number;
  closing_date: string | null;
}

interface InvestorAlloc {
  id: string; round_name: string; round_id: string;
  token_amount: number; amount_usd: number; amount_received_usd: number;
  payment_status: string; approval_status: string;
}

interface InvestorRow {
  id: string; full_name: string; email: string;
  kyc_status: string; pq_status: string;
  total_tokens: number; pct_ownership: number;
  total_usd_due: number; total_usd_received: number;
  payment_summary: string; has_grant: boolean;
  allocations: InvestorAlloc[];
}

interface VestingPoint {
  month: number; total_unlocked: number;
  per_round: Record<string, number>;
}

interface CapTableData {
  total_supply: number; reserved_tokens: number;
  tge_date: string | null; token_ticker: string;
  total_allocated: number; total_available: number;
  total_capital_due: number; total_capital_received: number;
  investor_count: number;
  rounds: RoundData[];
  investors: InvestorRow[];
  vesting_schedule: VestingPoint[];
}

// ── View filter ──
type ViewMode = "all" | "confirmed" | "pending";

// ═══════════════════════════════════════════════════════════
// STAT CARD
// ═══════════════════════════════════════════════════════════

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
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color || "#1a3c2a" }}
          />
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════

export default function CapTablePage() {
  const [data, setData] = useState<CapTableData | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("all");
  const [search, setSearch] = useState("");
  const [roundFilter, setRoundFilter] = useState("");
  const [expandedInvestor, setExpandedInvestor] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<"tokens" | "pct" | "due" | "received" | "name">("tokens");
  const [sortAsc, setSortAsc] = useState(false);
  const [showVesting, setShowVesting] = useState(false);

  useEffect(() => {
    fetch("/api/admin/cap-table")
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  // ── Filter + sort investors ──
  const filteredInvestors = useMemo(() => {
    if (!data) return [];
    let list = [...data.investors];

    // View mode filter
    if (viewMode === "confirmed") {
      list = list.filter((i) =>
        i.allocations.every((a) => a.payment_status === "paid" || a.payment_status === "grant")
      );
    } else if (viewMode === "pending") {
      list = list.filter((i) =>
        i.allocations.some((a) => ["unpaid", "invoiced", "partial"].includes(a.payment_status))
      );
    }

    // Round filter
    if (roundFilter) {
      list = list.filter((i) => i.allocations.some((a) => a.round_id === roundFilter));
    }

    // Search
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((i) =>
        i.full_name.toLowerCase().includes(q) || i.email.toLowerCase().includes(q)
      );
    }

    // Sort
    list.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name": cmp = a.full_name.localeCompare(b.full_name); break;
        case "tokens": cmp = a.total_tokens - b.total_tokens; break;
        case "pct": cmp = a.pct_ownership - b.pct_ownership; break;
        case "due": cmp = a.total_usd_due - b.total_usd_due; break;
        case "received": cmp = a.total_usd_received - b.total_usd_received; break;
      }
      return sortAsc ? cmp : -cmp;
    });

    return list;
  }, [data, viewMode, roundFilter, search, sortKey, sortAsc]);

  // ── Donut data ──
  const donutData = useMemo(() => {
    if (!data) return [];
    const slices: { name: string; value: number; color: string }[] = [];
    data.rounds.forEach((r, i) => {
      if (r.tokens_allocated > 0) {
        slices.push({ name: r.name, value: r.tokens_allocated, color: ROUND_COLORS[i % ROUND_COLORS.length] });
      }
    });
    if (data.reserved_tokens > 0) {
      slices.push({ name: "Reserved", value: data.reserved_tokens, color: RESERVED_COLOR });
    }
    if (data.total_available > 0) {
      slices.push({ name: "Available", value: data.total_available, color: AVAILABLE_COLOR });
    }
    return slices;
  }, [data]);

  // ── Vesting chart data ──
  const vestingChartData = useMemo(() => {
    if (!data) return [];
    return data.vesting_schedule.map((v) => ({
      month: v.month === 0 ? "TGE" : `M${v.month}`,
      ...v.per_round,
      total: v.total_unlocked,
    }));
  }, [data]);

  // ── Sort header helper ──
  const SortTh = ({ label, sk, align }: { label: string; sk: typeof sortKey; align?: string }) => (
    <th
      className={`py-2.5 px-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 ${align || "text-left"}`}
      onClick={() => { if (sortKey === sk) setSortAsc(!sortAsc); else { setSortKey(sk); setSortAsc(false); } }}
    >
      {label}{sortKey === sk ? (sortAsc ? " ↑" : " ↓") : ""}
    </th>
  );

  if (loading) return <div className="flex items-center justify-center min-h-[40vh]"><p className="text-gray-400">Loading cap table…</p></div>;
  if (!data) return <div className="text-center py-12 text-gray-400">Failed to load cap table</div>;

  const ticker = data.token_ticker;

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cap Table</h1>
          <p className="text-sm text-gray-500 mt-1">
            Token ownership across {data.rounds.length} round{data.rounds.length !== 1 ? "s" : ""} · {data.investor_count} investor{data.investor_count !== 1 ? "s" : ""}
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
        <StatCard
          label="Total Supply"
          value={fmt(data.total_supply)}
          sub={ticker}
        />
        <StatCard
          label="Allocated"
          value={fmt(data.total_allocated)}
          sub={fmtPct((data.total_allocated / data.total_supply) * 100)}
          pct={(data.total_allocated / data.total_supply) * 100}
          color="#1a3c2a"
        />
        <StatCard
          label="Reserved"
          value={fmt(data.reserved_tokens)}
          sub={data.reserved_tokens > 0 ? fmtPct((data.reserved_tokens / data.total_supply) * 100) : "Not set"}
          pct={(data.reserved_tokens / data.total_supply) * 100}
          color="#6b7280"
        />
        <StatCard
          label="Available"
          value={fmt(data.total_available)}
          sub={fmtPct((data.total_available / data.total_supply) * 100)}
          pct={(data.total_available / data.total_supply) * 100}
          color="#52b788"
        />
        <StatCard
          label="Capital Raised"
          value={fmtUsd(data.total_capital_received)}
          sub={data.total_capital_due > 0 ? `of ${fmtUsd(data.total_capital_due)} due` : "No capital due"}
        />
      </div>

      {/* ═══ ROUND BREAKDOWN ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Table */}
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
                {data.rounds.map((r, i) => (
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
                      {r.capital_due > 0 ? (
                        <span>{fmtUsd(r.capital_received)} <span className="text-gray-400">/ {fmtUsd(r.capital_due)}</span></span>
                      ) : "Grant"}
                    </td>
                    <td className="py-2.5 px-2 text-right text-gray-500 text-xs">
                      {r.tge_unlock_pct}% · {r.cliff_months}mo · {r.vesting_months}mo
                    </td>
                  </tr>
                ))}
                {data.rounds.length === 0 && (
                  <tr><td colSpan={7} className="py-8 text-center text-gray-400">No rounds configured</td></tr>
                )}
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
                <Pie
                  data={donutData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius="55%"
                  outerRadius="85%"
                  paddingAngle={1}
                >
                  {donutData.map((d, i) => (
                    <Cell key={i} fill={d.color} stroke="white" strokeWidth={2} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number) => [fmt(value), "Tokens"]}
                  contentStyle={{ fontSize: "12px", borderRadius: "8px", border: "1px solid #e5e7eb" }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          {/* Legend */}
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
        <div className="flex items-center justify-between mb-4">
          <CardHeader title="Investor Ownership" subtitle="Per-investor token allocation and payment status" />
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {/* View mode */}
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

          {/* Round filter */}
          <select
            value={roundFilter}
            onChange={(e) => setRoundFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-200"
          >
            <option value="">All Rounds</option>
            {data.rounds.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>

          {/* Search */}
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search investors…"
            className="px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-200 w-48"
          />

          <span className="text-[11px] text-gray-400 ml-auto">
            {filteredInvestors.length} investor{filteredInvestors.length !== 1 ? "s" : ""}
          </span>
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
              {filteredInvestors.map((inv) => (
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

                  {/* Expanded allocations */}
                  {expandedInvestor === inv.id && (
                    <tr key={`${inv.id}-exp`}>
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

              {filteredInvestors.length === 0 && (
                <tr><td colSpan={9} className="py-8 text-center text-gray-400">No matching investors</td></tr>
              )}

              {/* Totals row */}
              {filteredInvestors.length > 0 && (
                <tr className="border-t-2 border-gray-200 font-semibold text-gray-900">
                  <td className="py-3 px-2">Total</td>
                  <td className="py-3 px-2" />
                  <td className="py-3 px-2 text-right">{fmt(filteredInvestors.reduce((s, i) => s + i.total_tokens, 0))}</td>
                  <td className="py-3 px-2 text-right">{fmtPct(filteredInvestors.reduce((s, i) => s + i.pct_ownership, 0))}</td>
                  <td className="py-3 px-2 text-right">{fmtUsd(filteredInvestors.reduce((s, i) => s + i.total_usd_due, 0))}</td>
                  <td className="py-3 px-2 text-right">{fmtUsd(filteredInvestors.reduce((s, i) => s + i.total_usd_received, 0))}</td>
                  <td colSpan={3} />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ═══ VESTING TIMELINE ═══ */}
      <Card>
        <div className="flex items-center justify-between">
          <CardHeader
            title="Vesting Timeline"
            subtitle={data.tge_date
              ? `Projected token unlocks from TGE (${new Date(data.tge_date).toLocaleDateString()})`
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
                    const round = data.rounds.find((r) => r.id === name);
                    return [fmt(Math.round(value)), round?.name || name];
                  }}
                  contentStyle={{ fontSize: "12px", borderRadius: "8px", border: "1px solid #e5e7eb" }}
                />
                <Legend
                  formatter={(value) => {
                    const round = data.rounds.find((r) => r.id === value);
                    return round?.name || value;
                  }}
                  wrapperStyle={{ fontSize: "11px" }}
                />
                {data.rounds.map((r, i) => (
                  <Area
                    key={r.id}
                    type="monotone"
                    dataKey={r.id}
                    stackId="1"
                    fill={ROUND_COLORS[i % ROUND_COLORS.length]}
                    stroke={ROUND_COLORS[i % ROUND_COLORS.length]}
                    fillOpacity={0.7}
                  />
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
