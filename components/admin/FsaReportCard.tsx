"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { toast } from "sonner";

const fmt = (n: number) => n.toLocaleString();
const fmtUsd = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const inputCls = "w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500";

interface FsaData {
  report: {
    total_supply: number; tokens_allocated: number; tokens_reserved: number; tokens_unissued: number;
    total_proceeds_received: number; total_proceeds_due: number; investor_count: number;
    jurisdiction_breakdown: Record<string, { count: number; tokens: number }>;
    qualification_breakdown: Record<string, { count: number; tokens: number }>;
    malaysian_summary: { count: number; tokens: number };
  };
  editable: {
    proceeds_utilization: Record<string, number>;
    project_performance: string;
  };
}

export function FsaReportCard() {
  const [data, setData] = useState<FsaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showDetail, setShowDetail] = useState(false);

  // Editable fields
  const [utilization, setUtilization] = useState<Record<string, number>>({});
  const [performance, setPerformance] = useState("");
  const [newCategory, setNewCategory] = useState("");

  useEffect(() => {
    fetch("/api/admin/reports/fsa")
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setUtilization(d.editable?.proceeds_utilization || {});
        setPerformance(d.editable?.project_performance || "");
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const res = await fetch("/api/admin/reports/fsa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proceeds_utilization: utilization, project_performance: performance }),
    });
    setSaving(false);
    if (res.ok) toast.success("FSA report data saved");
    else toast.error("Failed to save");
  };

  const addCategory = () => {
    if (!newCategory) return;
    setUtilization({ ...utilization, [newCategory]: 0 });
    setNewCategory("");
  };

  const removeCategory = (key: string) => {
    const next = { ...utilization };
    delete next[key];
    setUtilization(next);
  };

  if (loading) return <Card><p className="text-xs text-gray-400 py-4 text-center">Loading FSA data…</p></Card>;
  if (!data) return null;

  const r = data.report;

  return (
    <Card>
      <div className="flex items-center justify-between">
        <CardHeader
          title="Labuan FSA Semi-Annual Report"
          subtitle="Token circulation, proceeds, and investor breakdown for FSA submission"
        />
        <Button variant="ghost" size="sm" onClick={() => setShowDetail(!showDetail)} className="text-xs">
          {showDetail ? "Collapse" : "Expand"}
        </Button>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <p className="text-[10px] text-gray-500 uppercase">Tokens Allocated</p>
          <p className="text-sm font-bold text-gray-900">{fmt(r.tokens_allocated)}</p>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <p className="text-[10px] text-gray-500 uppercase">Proceeds Received</p>
          <p className="text-sm font-bold text-emerald-700">{fmtUsd(r.total_proceeds_received)}</p>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <p className="text-[10px] text-gray-500 uppercase">Investors</p>
          <p className="text-sm font-bold text-gray-900">{r.investor_count}</p>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <p className="text-[10px] text-gray-500 uppercase">Malaysian</p>
          <p className="text-sm font-bold text-gray-900">{r.malaysian_summary.count} ({fmt(r.malaysian_summary.tokens)} tokens)</p>
        </div>
      </div>

      {showDetail && (
        <div className="space-y-5">
          {/* Jurisdiction breakdown */}
          <div>
            <p className="text-xs font-semibold text-gray-700 mb-2">Investors by Jurisdiction</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {Object.entries(r.jurisdiction_breakdown)
                .sort(([, a], [, b]) => b.tokens - a.tokens)
                .map(([j, d]) => (
                  <div key={j} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                    <span className="text-xs text-gray-700 font-medium">{j}</span>
                    <span className="text-xs text-gray-500">{d.count} inv · {fmt(d.tokens)}</span>
                  </div>
                ))}
            </div>
          </div>

          {/* Qualification breakdown */}
          <div>
            <p className="text-xs font-semibold text-gray-700 mb-2">Investors by Qualification</p>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(r.qualification_breakdown)
                .sort(([, a], [, b]) => b.count - a.count)
                .map(([q, d]) => (
                  <div key={q} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                    <span className="text-xs text-gray-700">{q.replace(/_/g, " ")}</span>
                    <span className="text-xs text-gray-500">{d.count}</span>
                  </div>
                ))}
            </div>
          </div>

          {/* Proceeds utilization (editable) */}
          <div>
            <p className="text-xs font-semibold text-gray-700 mb-2">Proceeds Utilization</p>
            <div className="space-y-2">
              {Object.entries(utilization).map(([cat, amount]) => (
                <div key={cat} className="flex items-center gap-2">
                  <span className="text-xs text-gray-600 w-40 truncate">{cat}</span>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setUtilization({ ...utilization, [cat]: Number(e.target.value) || 0 })}
                    className={`${inputCls} w-32 text-xs`}
                  />
                  <span className="text-[10px] text-gray-400">USD</span>
                  <button onClick={() => removeCategory(cat)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <input
                  type="text" value={newCategory} onChange={(e) => setNewCategory(e.target.value)}
                  placeholder="Add category (e.g. Conservation, Operations)" className={`${inputCls} w-40 text-xs`}
                />
                <Button size="sm" variant="secondary" onClick={addCategory} className="text-xs">+ Add</Button>
              </div>
            </div>
          </div>

          {/* Project performance (editable) */}
          <div>
            <p className="text-xs font-semibold text-gray-700 mb-2">Project Performance Narrative</p>
            <textarea
              value={performance}
              onChange={(e) => setPerformance(e.target.value)}
              rows={4}
              placeholder="Describe project progress, milestones achieved, and planned activities for FSA reporting…"
              className={inputCls}
            />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
            <Button size="sm" onClick={handleSave} loading={saving}>Save Report Data</Button>
            <a
              href="/api/admin/export?type=cap_table"
              download
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              ↓ Export Cap Table CSV
            </a>
            <a
              href="/api/admin/export?type=pool_grants"
              download
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              ↓ Export Grants CSV
            </a>
          </div>
        </div>
      )}
    </Card>
  );
}
