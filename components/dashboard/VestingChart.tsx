"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { AllocationWithRound } from "@/lib/types";
import { generateVestingSchedule, formatTokenAmount } from "@/lib/vesting";
import { Card, CardHeader } from "@/components/ui/Card";
import { useEntity } from "@/components/EntityConfigProvider";

interface VestingChartProps {
  /** Confirmed allocations: paid + grants with completed steps */
  confirmed: AllocationWithRound[];
  /** Unconfirmed allocations: invoiced, partial, unpaid */
  unconfirmed: AllocationWithRound[];
}

/**
 * Projected vesting schedule with two lines:
 *   - Confirmed (solid green): paid/granted allocations
 *   - Pending (dashed gray): unconfirmed allocations, shown as potential upside
 *
 * X-axis: months from TGE (relative, since TGE date is TBD)
 * Y-axis: cumulative tokens unlocked
 */
export function VestingChart({ confirmed, unconfirmed }: VestingChartProps) {
  const entity = useEntity();
  const accent = `#${entity.accent}`;
  const confirmedData = generateVestingSchedule(confirmed);
  const unconfirmedData = generateVestingSchedule(unconfirmed);

  // Nothing to chart at all
  if (confirmedData.length === 0 && unconfirmedData.length === 0) return null;

  const hasConfirmed = confirmedData.length > 0;
  const hasUnconfirmed = unconfirmedData.length > 0;
  const hasBoth = hasConfirmed && hasUnconfirmed;

  // Merge into a single dataset aligned by month
  const maxMonth = Math.max(
    confirmedData.length > 0 ? confirmedData[confirmedData.length - 1].month : 0,
    unconfirmedData.length > 0 ? unconfirmedData[unconfirmedData.length - 1].month : 0
  );

  // Build a lookup for quick access
  const confirmedMap = new Map(confirmedData.map((d) => [d.month, d.unlocked]));
  const unconfirmedMap = new Map(unconfirmedData.map((d) => [d.month, d.unlocked]));

  const mergedData: {
    month: number;
    label: string;
    confirmed: number;
    pending: number;
  }[] = [];

  for (let m = 0; m <= maxMonth; m++) {
    const cVal = confirmedMap.get(m) ?? (hasConfirmed ? (confirmedMap.get(confirmedData[confirmedData.length - 1].month) ?? 0) : 0);
    const uVal = unconfirmedMap.get(m) ?? (hasUnconfirmed ? (unconfirmedMap.get(unconfirmedData[unconfirmedData.length - 1].month) ?? 0) : 0);

    mergedData.push({
      month: m,
      label: m === 0 ? "TGE" : `Month ${m}`,
      confirmed: cVal,
      // Pending line shows total potential (confirmed + unconfirmed)
      pending: cVal + uVal,
    });
  }

  return (
    <Card>
      <CardHeader
        title="Vesting Schedule"
        subtitle="Projected token unlock timeline (relative to TGE)"
      />

      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={mergedData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <defs>
              {/* Confirmed: solid green gradient */}
              <linearGradient id="confirmedGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={accent} stopOpacity={0.3} />
                <stop offset="100%" stopColor={accent} stopOpacity={0.02} />
              </linearGradient>
              {/* Pending: subtle gray gradient */}
              <linearGradient id="pendingGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#9ca3af" stopOpacity={0.15} />
                <stop offset="100%" stopColor="#9ca3af" stopOpacity={0.02} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />

            <XAxis
              dataKey="label"
              tick={{ fontSize: 12, fill: "#9ca3af" }}
              tickLine={false}
              axisLine={{ stroke: "#e5e7eb" }}
              interval={Math.max(0, Math.floor(mergedData.length / 8))}
            />

            <YAxis
              tick={{ fontSize: 12, fill: "#9ca3af" }}
              tickLine={false}
              axisLine={{ stroke: "#e5e7eb" }}
              tickFormatter={(v) => formatTokenAmount(v)}
              width={65}
            />

            <Tooltip
              contentStyle={{
                backgroundColor: "#fff",
                border: "1px solid #e5e7eb",
                borderRadius: "8px",
                fontSize: "13px",
              }}
              formatter={(value: number, name: string) => [
                `${value.toLocaleString()} $${entity.ticker}`,
                name === "pending" ? "Total (incl. pending)" : "Confirmed",
              ]}
              labelStyle={{ fontWeight: 600, color: `#${entity.primary}` }}
            />

            {/* Pending line: dashed, sits behind confirmed */}
            {hasUnconfirmed && (
              <Area
                type="stepAfter"
                dataKey="pending"
                stroke="#9ca3af"
                strokeWidth={1.5}
                strokeDasharray="6 3"
                fill="url(#pendingGradient)"
                name="pending"
              />
            )}

            {/* Confirmed line: solid green, drawn on top */}
            {hasConfirmed && (
              <Area
                type="stepAfter"
                dataKey="confirmed"
                stroke={accent}
                strokeWidth={2}
                fill="url(#confirmedGradient)"
                name="confirmed"
              />
            )}

            {hasBoth && (
              <Legend
                verticalAlign="top"
                align="right"
                iconType="line"
                wrapperStyle={{ fontSize: "12px", paddingBottom: "8px" }}
                formatter={(value: string) =>
                  value === "confirmed" ? "Confirmed" : "Pending"
                }
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <p className="text-xs text-gray-400 mt-3">
        Timeline is relative to TGE. Actual dates will be updated once TGE is announced.
        {hasUnconfirmed && (
          <span className="ml-1">
            Dashed line includes pending allocations that require further action.
          </span>
        )}
      </p>
    </Card>
  );
}
