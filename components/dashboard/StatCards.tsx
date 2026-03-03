import { AllocationWithRound } from "@/lib/types";
import { formatTokenAmount } from "@/lib/vesting";
import { Card } from "@/components/ui/Card";
import { KycBadge } from "@/components/ui/Badge";

interface StatCardsProps {
  allocations: AllocationWithRound[];
  kycStatus: string;
  ticker?: string;
}

/**
 * Three summary cards at the top of the dashboard:
 *   1. Total Token Allocation
 *   2. Vesting Status (pre-TGE = always 0%)
 *   3. KYC Status
 */
export function StatCards({ allocations, kycStatus, ticker = "TOKEN" }: StatCardsProps) {
  // Sum tokens across all rounds
  const totalTokens = allocations.reduce(
    (sum, a) => sum + Number(a.token_amount),
    0
  );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {/* Total Allocation */}
      <Card>
        <p className="text-sm font-medium text-gray-500">
          Total ${ticker} Allocation
        </p>
        <p className="text-2xl font-bold text-gray-900 mt-1">
          {formatTokenAmount(totalTokens)}
        </p>
        <p className="text-xs text-gray-400 mt-1">
          Across {allocations.length} round
          {allocations.length !== 1 ? "s" : ""}
        </p>
      </Card>

      {/* Vesting Status — static pre-TGE */}
      <Card>
        <p className="text-sm font-medium text-gray-500">Vesting Status</p>
        <p className="text-2xl font-bold text-gray-900 mt-1">0%</p>
        <p className="text-xs text-amber-600 mt-1 font-medium">
          ⏳ Awaiting TGE
        </p>
      </Card>

      {/* KYC Status */}
      <Card>
        <p className="text-sm font-medium text-gray-500">KYC Status</p>
        <div className="mt-2">
          <KycBadge status={kycStatus} />
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Verification required before token claim
        </p>
      </Card>
    </div>
  );
}
