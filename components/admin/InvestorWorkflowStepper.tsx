"use client";

/**
 * InvestorWorkflowStepper
 *
 * Visual progress indicator showing where an investor is in the
 * onboarding pipeline. Each step shows completed/current/pending
 * status with actionable hints for admins.
 *
 * Steps:
 * 1. Investor Added       — always complete (they're on this page)
 * 2. Allocation Assigned   — has allocations?
 * 3. KYC Verified          — kyc_status === "verified"
 * 4. Documents Sent        — investor_documents exist
 * 5. PQ Submitted          — pq_status === "submitted" | "approved" | "rejected"
 * 6. SAFT Signed           — any saft doc status === "signed"
 * 7. PQ Approved           — pq_status === "approved"
 * 8. Capital Call Sent      — email_events includes capital_call
 * 9. Payment Confirmed     — all allocations paid
 */

interface StepDef {
  label: string;
  status: "complete" | "current" | "pending" | "warning";
  hint?: string; // Short actionable note for admins
}

interface WorkflowStepperProps {
  investor: {
    kyc_status: string;
    pq_status: string;
    docs_sent_at: string | null;
    allocations: { payment_status: string }[];
    email_events: { email_type: string }[];
    investor_documents?: { doc_type: string; status: string }[];
  };
}

export function InvestorWorkflowStepper({ investor }: WorkflowStepperProps) {
  const allocs = investor.allocations || [];
  const docs = investor.investor_documents || [];
  const emailEvents = investor.email_events || [];

  // ── Derive states ──
  const hasAllocation = allocs.length > 0;
  const kycVerified = investor.kyc_status === "verified";
  const kycPending = investor.kyc_status === "pending";
  const docsGenerated = docs.length > 0;
  const pqSubmitted = ["submitted", "approved", "rejected"].includes(investor.pq_status);
  const pqApproved = investor.pq_status === "approved";
  const pqRejected = investor.pq_status === "rejected";
  const saftSigned = docs.some((d) => d.doc_type === "saft" && d.status === "signed");
  const capitalCallSent = emailEvents.some((e) => e.email_type === "capital_call");
  const allPaid = hasAllocation && allocs.every((a) => a.payment_status === "paid" || a.payment_status === "grant");
  const partialPaid = hasAllocation && allocs.some((a) => a.payment_status === "paid" || a.payment_status === "partial" || a.payment_status === "grant");

  // ── Build steps ──
  const steps: StepDef[] = [
    {
      label: "Investor Added",
      status: "complete",
    },
    {
      label: "Allocation Assigned",
      status: hasAllocation ? "complete" : "current",
      hint: hasAllocation ? undefined : "Add an allocation to proceed",
    },
    {
      label: "KYC Verified",
      status: kycVerified
        ? "complete"
        : !hasAllocation
          ? "pending"
          : kycPending
            ? "current"
            : "current",
      hint: kycVerified
        ? undefined
        : kycPending
          ? "Under review by Sumsub"
          : "Awaiting investor KYC submission",
    },
    {
      label: "Documents Sent",
      status: docsGenerated
        ? "complete"
        : !kycVerified
          ? "pending"
          : "current",
      hint: docsGenerated
        ? `${docs.length} document(s) generated`
        : !kycVerified
          ? undefined
          : !hasAllocation
            ? "Needs allocation first"
            : "Auto-generates on KYC approval, or generate manually",
    },
    {
      label: "PQ Submitted",
      status: pqSubmitted
        ? "complete"
        : !docsGenerated
          ? "pending"
          : "current",
      hint: pqSubmitted
        ? undefined
        : "Awaiting investor submission",
    },
    {
      label: "SAFT Signed",
      status: saftSigned
        ? "complete"
        : !docsGenerated
          ? "pending"
          : "current",
      hint: saftSigned
        ? undefined
        : docsGenerated
          ? "Awaiting investor signature"
          : undefined,
    },
    {
      label: "PQ Approved",
      status: pqApproved
        ? "complete"
        : pqRejected
          ? "warning"
          : !pqSubmitted
            ? "pending"
            : "current",
      hint: pqApproved
        ? undefined
        : pqRejected
          ? "PQ was rejected — awaiting resubmission"
          : pqSubmitted
            ? "Review and approve the PQ"
            : undefined,
    },
    {
      label: "Capital Call Sent",
      status: capitalCallSent
        ? "complete"
        : !(pqApproved && saftSigned)
          ? "pending"
          : "current",
      hint: capitalCallSent
        ? undefined
        : "Auto-sends when PQ approved + SAFT signed",
    },
    {
      label: "Payment Confirmed",
      status: allPaid
        ? "complete"
        : partialPaid
          ? "current"
          : !capitalCallSent
            ? "pending"
            : "current",
      hint: allPaid
        ? undefined
        : partialPaid
          ? "Partial payment received"
          : capitalCallSent
            ? "Awaiting investor payment"
            : undefined,
    },
  ];

  // Find the active step index (first non-complete)
  const activeIdx = steps.findIndex((s) => s.status !== "complete");

  return (
    <div className="relative">
      {/* Steps */}
      <div className="flex items-start justify-between gap-0">
        {steps.map((step, i) => {
          const isComplete = step.status === "complete";
          const isCurrent = step.status === "current";
          const isWarning = step.status === "warning";
          const isPending = step.status === "pending";
          const isLast = i === steps.length - 1;

          return (
            <div key={step.label} className="flex-1 flex flex-col items-center relative">
              {/* Connector line (before this step) */}
              {i > 0 && (
                <div
                  className={`absolute top-3.5 right-1/2 w-full h-0.5 -z-10 ${
                    isComplete || isCurrent || isWarning ? "bg-brand-300" : "bg-gray-200"
                  }`}
                />
              )}

              {/* Step circle */}
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                  isComplete
                    ? "bg-brand-600 text-white"
                    : isCurrent
                      ? "bg-white border-2 border-brand-500 text-brand-600"
                      : isWarning
                        ? "bg-amber-100 border-2 border-amber-400 text-amber-600"
                        : "bg-gray-100 border border-gray-200 text-gray-400"
                }`}
              >
                {isComplete ? (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                ) : isWarning ? (
                  "!"
                ) : (
                  i + 1
                )}
              </div>

              {/* Label */}
              <p className={`text-[10px] text-center mt-1.5 leading-tight max-w-[80px] ${
                isComplete
                  ? "text-gray-600 font-medium"
                  : isCurrent
                    ? "text-brand-700 font-semibold"
                    : isWarning
                      ? "text-amber-700 font-semibold"
                      : "text-gray-400"
              }`}>
                {step.label}
              </p>

              {/* Hint (shown only for current/warning steps) */}
              {step.hint && (isCurrent || isWarning) && (
                <p className={`text-[9px] text-center mt-0.5 max-w-[90px] leading-tight ${
                  isWarning ? "text-amber-500" : "text-gray-400"
                }`}>
                  {step.hint}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
