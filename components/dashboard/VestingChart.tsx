"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { AllocationWithRound } from "@/lib/types";
import { generateVestingSchedule, formatTokenAmount } from "@/lib/vesting";
import { Card, CardHeader } from "@/components/ui/Card";

interface VestingChartProps {
  allocations: AllocationWithRound[];
}

/**
 * Projected vesting schedule visualization.
 * X-axis: months from TGE (relative, since TGE date is TBD)
 * Y-axis: cumulative tokens unlocked
 * Aggregates across all of the investor's allocations.
 */
export function VestingChart({ allocations }: VestingChartProps) {
  const data = generateVestingSchedule(allocations);

  if (data.length === 0) return null;

  return (
    <Card>
      <CardHeader
        title="Vesting Schedule"
        subtitle="Projected token unlock timeline (relative to TGE)"
      />

      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <defs>
              {/* Gradient fill for the area under the curve */}
              <linearGradient id="vestingGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2d5f3f" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#2d5f3f" stopOpacity={0.02} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />

            <XAxis
              dataKey="label"
              tick={{ fontSize: 12, fill: "#9ca3af" }}
              tickLine={false}
              axisLine={{ stroke: "#e5e7eb" }}
              // Show every 3rd label to avoid crowding
              interval={Math.max(0, Math.floor(data.length / 8))}
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
              formatter={(value: number) => [
                `${value.toLocaleString()} $KAYAN`,
                "Unlocked",
              ]}
              labelStyle={{ fontWeight: 600, color: "#1a3c2a" }}
            />

            <Area
              type="stepAfter"
              dataKey="unlocked"
              stroke="#2d5f3f"
              strokeWidth={2}
              fill="url(#vestingGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <p className="text-xs text-gray-400 mt-3">
        Timeline is relative to TGE. Actual dates will be updated once TGE is
        announced.
      </p>
    </Card>
  );
}
