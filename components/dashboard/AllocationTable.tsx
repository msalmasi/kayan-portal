import Link from "next/link";
import { AllocationWithRound } from "@/lib/types";
import { formatTokenAmount } from "@/lib/vesting";
import { Card, CardHeader } from "@/components/ui/Card";

// ─── Types ──────────────────────────────────────────────────

interface InvestorStatus {
  kycVerified: boolean;
  pqApproved: boolean;
  /** Raw PQ status for distinguishing submitted-but-pending from not-started */
  pqStatus: string;
  docsSent: boolean;
  /** Set of round IDs where the SAFT has been signed */
  signedRoundIds: Set<string>;
}

interface AllocationTableProps {
  allocations: AllocationWithRound[];
  investorStatus: InvestorStatus;
}

// ─── Helpers ────────────────────────────────────────────────

/** Determine which steps remain for a given allocation */
function getRequiredActions(
  alloc: AllocationWithRound,
  status: InvestorStatus
): { label: string; href: string; done: boolean; pending?: boolean }[] {
  const isGrant = alloc.payment_status === "grant";
  const isPaid = alloc.payment_status === "paid";

  const steps = [
    {
      label: "Complete KYC",
      href: "#kyc",
      done: status.kycVerified,
    },
    {
      label: status.pqApproved
        ? "Submit PQ"
        : status.pqStatus === "submitted"
          ? "PQ Awaiting Approval"
          : "Submit PQ",
      href: "/pq",
      done: status.pqApproved,
      pending: status.pqStatus === "submitted",
    },
    {
      label: "Sign SAFT",
      href: "/documents",
      done: status.signedRoundIds.has(alloc.round_id),
    },
  ];

  // Grants don't need payment
  if (!isGrant) {
    steps.push({
      label: "Complete Payment",
      href: "#payments",
      done: isPaid,
    });
  }

  return steps;
}

/** Status badge for an allocation */
function StatusBadge({ alloc, allDone, expired, expiredPartial }: { alloc: AllocationWithRound; allDone: boolean; expired?: boolean; expiredPartial?: boolean }) {
  if (expired) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-600">
        Expired
      </span>
    );
  }

  if (expiredPartial) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-700">
        Partially Paid
      </span>
    );
  }

  const ps = alloc.payment_status;

  if (ps === "grant" && allDone) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-700">
        ✓ Granted
      </span>
    );
  }
  if (ps === "paid") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-700">
        ✓ Confirmed
      </span>
    );
  }
  if (ps === "partial") {
    const totalDue = Number(alloc.amount_usd) || Number(alloc.token_amount) * Number(alloc.saft_rounds?.token_price || 0);
    const received = Number(alloc.amount_received_usd) || 0;
    const pct = totalDue > 0 ? Math.round((received / totalDue) * 100) : 0;
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-700">
        {pct}% Paid
      </span>
    );
  }

  // Pending states: unpaid, invoiced, or grant without steps done
  if (!allDone) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-500">
        Action Required
      </span>
    );
  }

  // All steps done, awaiting payment
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-700">
      Awaiting Payment
    </span>
  );
}

// ─── Component ──────────────────────────────────────────────

/** Displays all allocations with status indicators and required actions */
export function AllocationTable({ allocations, investorStatus }: AllocationTableProps) {
  // Sort: confirmed first, then by round name
  const sorted = [...allocations].sort((a, b) => {
    const order: Record<string, number> = { paid: 0, grant: 1, partial: 2, invoiced: 3, unpaid: 4 };
    const diff = (order[a.payment_status] ?? 5) - (order[b.payment_status] ?? 5);
    if (diff !== 0) return diff;
    return (a.saft_rounds?.name || "").localeCompare(b.saft_rounds?.name || "");
  });

  return (
    <Card>
      <CardHeader
        title="Your Allocations"
        subtitle="Token allocations across all rounds — complete the required steps to secure yours"
      />

      <div className="space-y-3">
        {sorted.map((alloc) => {
          const actions = getRequiredActions(alloc, investorStatus);
          const allDone = actions.every((a) => a.done);
          const isGrant = alloc.payment_status === "grant";
          const isPartial = alloc.payment_status === "partial";
          const isConfirmed = alloc.payment_status === "paid" || (isGrant && allDone);
          const nextAction = actions.find((a) => !a.done && !a.pending);

          // Deadline logic
          const deadlineStr = alloc.saft_rounds?.deadline;
          const deadlineDate = deadlineStr ? new Date(deadlineStr) : null;
          const isExpired = deadlineDate ? deadlineDate < new Date() : false;
          const isExpiredUnconfirmed = isExpired && !isConfirmed && !isPartial;
          const isExpiredPartial = isExpired && isPartial;

          // Days remaining for countdown
          const daysLeft = deadlineDate
            ? Math.ceil((deadlineDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
            : null;
          const isUrgent = daysLeft !== null && daysLeft > 0 && daysLeft <= 7;

          // For expired partials, compute the confirmed token amount
          const paidRatio = isPartial && Number(alloc.amount_usd) > 0
            ? (Number(alloc.amount_received_usd) || 0) / Number(alloc.amount_usd)
            : 0;
          const confirmedTokens = isExpiredPartial
            ? Math.floor(Number(alloc.token_amount) * paidRatio)
            : 0;
          const forfeitedTokens = isExpiredPartial
            ? Number(alloc.token_amount) - confirmedTokens
            : 0;

          return (
            <div
              key={alloc.id}
              className={`border rounded-xl px-5 py-4 transition-colors ${
                isExpiredUnconfirmed
                  ? "border-red-200 bg-red-50/30 opacity-75"
                  : isExpiredPartial
                    ? "border-amber-200 bg-amber-50/30"
                    : isConfirmed
                      ? "border-emerald-200 bg-emerald-50/30"
                      : "border-gray-200 bg-white"
              }`}
            >
              {/* Top row: round name, tokens, badge */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-gray-900">
                      {alloc.saft_rounds?.name || "Unknown Round"}
                    </p>
                    {isGrant && (
                      <span className="text-[10px] font-medium text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                        Grant
                      </span>
                    )}
                  </div>
                  {alloc.saft_rounds?.token_price != null && !isGrant && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      {Number(alloc.saft_rounds.token_price) > 0
                        ? `@ $${Number(alloc.saft_rounds.token_price).toFixed(4)}/token`
                        : "Free allocation"}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  {isExpiredPartial ? (
                    <>
                      <p className="text-lg font-bold text-amber-700">
                        {formatTokenAmount(confirmedTokens)}
                      </p>
                      <p className="text-[10px] text-gray-400 line-through">
                        of {formatTokenAmount(Number(alloc.token_amount))}
                      </p>
                    </>
                  ) : (
                    <p className={`text-lg font-bold ${isConfirmed ? "text-emerald-700" : "text-gray-900"}`}>
                      {formatTokenAmount(Number(alloc.token_amount))}
                    </p>
                  )}
                  <StatusBadge alloc={alloc} allDone={allDone} expired={isExpiredUnconfirmed} expiredPartial={isExpiredPartial} />
                </div>
              </div>

              {/* Vesting info (compact) */}
              {alloc.saft_rounds && (
                <div className="flex flex-wrap gap-4 mt-2 text-[11px] text-gray-400">
                  <span>TGE: {alloc.saft_rounds.tge_unlock_pct}%</span>
                  <span>Cliff: {alloc.saft_rounds.cliff_months > 0 ? `${alloc.saft_rounds.cliff_months}mo` : "None"}</span>
                  <span>Vesting: {alloc.saft_rounds.vesting_months}mo</span>
                  {deadlineDate && !isConfirmed && (
                    <span className={
                      isExpired ? "text-red-500 font-medium" :
                      isUrgent ? "text-amber-600 font-medium" :
                      ""
                    }>
                      {isExpired
                        ? `Deadline passed ${deadlineDate.toLocaleDateString()}`
                        : `Deadline: ${deadlineDate.toLocaleDateString()}${isUrgent ? ` (${daysLeft}d left)` : ""}`
                      }
                    </span>
                  )}
                </div>
              )}

              {/* Expired partial — show paid portion and forfeited remainder */}
              {isExpiredPartial && (
                <div className="mt-3 pt-3 border-t border-amber-200">
                  <p className="text-xs text-amber-700">
                    <span className="font-medium">{formatTokenAmount(confirmedTokens)} tokens confirmed</span> from partial payment of ${(Number(alloc.amount_received_usd) || 0).toLocaleString()}.
                    The deadline passed on {deadlineDate!.toLocaleDateString()} — the remaining {formatTokenAmount(forfeitedTokens)} tokens are no longer available.
                  </p>
                </div>
              )}

              {/* Expired unconfirmed — fully forfeited */}
              {isExpiredUnconfirmed && (
                <div className="mt-3 pt-3 border-t border-red-100">
                  <p className="text-xs text-red-500">
                    The payment deadline for this round has passed. This allocation is no longer available.
                  </p>
                </div>
              )}

              {/* Progress steps — only shown when not confirmed, not expired */}
              {!isConfirmed && !isExpiredUnconfirmed && !isExpiredPartial && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {actions.map((action, i) => (
                      <div key={i} className="flex items-center gap-1.5">
                        {action.done ? (
                          <svg className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        ) : action.pending ? (
                          <svg className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2" />
                            <circle cx="12" cy="12" r="9" strokeWidth={2} />
                          </svg>
                        ) : (
                          <span className="w-3.5 h-3.5 rounded-full border-2 border-gray-300 flex-shrink-0" />
                        )}
                        <span className={`text-xs ${action.done ? "text-gray-400 line-through" : action.pending ? "text-amber-600" : "text-gray-600"}`}>
                          {action.label}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Call-to-action for the next incomplete step */}
                  {nextAction && (
                    <Link
                      href={nextAction.href}
                      className="inline-flex items-center gap-1 mt-2 text-xs font-medium text-kayan-600 hover:text-kayan-800"
                    >
                      Next: {nextAction.label} →
                    </Link>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {allocations.length === 0 && (
          <div className="py-8 text-center text-gray-400 text-sm">
            No allocations yet. You&apos;ll see your token allocations here once an admin assigns them.
          </div>
        )}
      </div>
    </Card>
  );
}
