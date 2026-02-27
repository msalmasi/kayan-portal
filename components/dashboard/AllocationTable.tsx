import { AllocationWithRound } from "@/lib/types";
import { formatTokenAmount } from "@/lib/vesting";
import { Card, CardHeader } from "@/components/ui/Card";

interface AllocationTableProps {
  allocations: AllocationWithRound[];
}

/** Displays one row per allocation — investors may appear in multiple rounds */
export function AllocationTable({ allocations }: AllocationTableProps) {
  return (
    <Card>
      <CardHeader
        title="Your Allocations"
        subtitle="Token allocation details by funding round"
      />

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left py-3 px-2 font-medium text-gray-500">
                Round
              </th>
              <th className="text-right py-3 px-2 font-medium text-gray-500">
                Tokens
              </th>
              <th className="text-right py-3 px-2 font-medium text-gray-500">
                TGE Unlock
              </th>
              <th className="text-right py-3 px-2 font-medium text-gray-500">
                Cliff
              </th>
              <th className="text-right py-3 px-2 font-medium text-gray-500">
                Vesting
              </th>
            </tr>
          </thead>
          <tbody>
            {allocations.map((alloc) => {
              const isPartial = (alloc as any)._is_partial;
              const paidPct = isPartial
                ? Math.round((alloc as any)._paid_ratio * 100)
                : null;

              return (
                <tr
                  key={alloc.id}
                  className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50"
                >
                  <td className="py-3 px-2 font-medium text-gray-900">
                    {alloc.saft_rounds.name}
                    {isPartial && (
                      <span className="ml-2 inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700">
                        {paidPct}% paid
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-2 text-right text-gray-700">
                    {formatTokenAmount(Number(alloc.token_amount))}
                  </td>
                  <td className="py-3 px-2 text-right text-gray-700">
                    {alloc.saft_rounds.tge_unlock_pct}%
                  </td>
                  <td className="py-3 px-2 text-right text-gray-700">
                    {alloc.saft_rounds.cliff_months > 0
                      ? `${alloc.saft_rounds.cliff_months}mo`
                      : "None"}
                  </td>
                  <td className="py-3 px-2 text-right text-gray-700">
                    {alloc.saft_rounds.vesting_months}mo
                  </td>
                </tr>
              );
            })}

            {allocations.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="py-8 text-center text-gray-400"
                >
                  Your token allocations will appear here once payment has been confirmed.
                  If you have completed payment, please allow time for processing.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
