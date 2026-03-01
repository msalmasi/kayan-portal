import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase-server";
import { AllocationWithRound, Investor } from "@/lib/types";
import { StatCards } from "@/components/dashboard/StatCards";
import { AllocationTable } from "@/components/dashboard/AllocationTable";
import { VestingChart } from "@/components/dashboard/VestingChart";
import { WalletSection } from "@/components/dashboard/Placeholders";
import { SumsubKycWidget } from "@/components/dashboard/SumsubKycWidget";
import { PaymentFlow } from "@/components/dashboard/PaymentFlow";

/**
 * /dashboard — Main investor view
 *
 * Server Component: fetches data directly from Supabase with RLS.
 * The investor only sees their own records (enforced by RLS policies).
 */
export default async function DashboardPage() {
  const supabase = await createServerSupabase();

  // Get the current user's email
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) redirect("/login");

  // Fetch the investor record — use ilike for case-insensitive match
  const { data: investor } = await supabase
    .from("investors")
    .select("*")
    .ilike("email", user.email)
    .single();

  // If no investor record exists for this email, show a support message
  if (!investor) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
          <svg
            className="w-8 h-8 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
            />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-gray-900">
          No investor record found
        </h2>
        <p className="text-sm text-gray-500 mt-2 max-w-md">
          Your email ({user.email}) is not associated with any SAFT agreement.
          If you believe this is an error, please contact{" "}
          <a
            href="mailto:support@kayanforest.com"
            className="text-kayan-500 hover:underline"
          >
            support@kayanforest.com
          </a>
          .
        </p>
      </div>
    );
  }

  // Fetch ALL approved allocations (every status — paid, partial, invoiced, unpaid, grant)
  const { data: allAllocations } = await supabase
    .from("allocations")
    .select("*, saft_rounds(*)")
    .eq("investor_id", investor.id)
    .eq("approval_status", "approved");

  // Helper: check if an allocation's round deadline has passed
  const isRoundExpired = (a: any) => {
    const dl = a.saft_rounds?.deadline;
    return dl ? new Date(dl) < new Date() : false;
  };

  // Fetch invoiced + partial for amount due banner (exclude expired rounds)
  const outstandingAllocations = (allAllocations || []).filter(
    (a: any) => (a.payment_status === "invoiced" || a.payment_status === "partial") && !isRoundExpired(a)
  );

  // Separate confirmed (shown in stats/vesting) vs all (shown in table)
  const confirmedAllocations = (allAllocations || []).filter(
    (a: any) => a.payment_status === "paid" || a.payment_status === "grant"
  );

  // For partial allocations, scale token_amount to the paid proportion.
  const partialAllocations = (allAllocations || []).filter(
    (a: any) => a.payment_status === "partial"
  );
  const scaledPartials = partialAllocations.map((a: any) => {
    const totalDue = Number(a.amount_usd) || Number(a.token_amount) * Number(a.saft_rounds?.token_price || 0);
    const received = Number(a.amount_received_usd) || 0;
    const paidRatio = totalDue > 0 ? received / totalDue : 0;
    return {
      ...a,
      token_amount: Math.floor(Number(a.token_amount) * paidRatio),
      _is_partial: true,
      _paid_ratio: paidRatio,
      _amount_received: received,
      _amount_total: totalDue,
    };
  });

  // Stats/vesting show confirmed + scaled partials
  const typedAllocations = [
    ...confirmedAllocations,
    ...scaledPartials,
  ] as AllocationWithRound[];

  const typedInvestor = investor as Investor;

  // Calculate remaining balance: total due minus what's been received (exclude expired)
  const amountDue = outstandingAllocations.reduce((sum: number, a: any) => {
    const total = Number(a.amount_usd) || Number(a.token_amount) * Number(a.saft_rounds?.token_price || 0);
    const received = Number(a.amount_received_usd) || 0;
    return sum + (total - received);
  }, 0);

  // Unconfirmed allocations for vesting chart pending line
  // Exclude expired rounds — those are forfeited, not "pending"
  const fullyUnpaid = (allAllocations || []).filter(
    (a: any) => (a.payment_status === "invoiced" || a.payment_status === "unpaid") && !isRoundExpired(a)
  ) as AllocationWithRound[];

  // Remaining portion of partial payments (exclude expired — that portion is forfeited)
  const partialRemaining = scaledPartials.map((a: any) => ({
    ...a,
    token_amount: Number((allAllocations || []).find((o: any) => o.id === a.id)?.token_amount || 0) - Number(a.token_amount),
  })).filter((a: any) => a.token_amount > 0 && !isRoundExpired(a)) as AllocationWithRound[];

  const unconfirmedAllocations = [...fullyUnpaid, ...partialRemaining];

  // Fetch SAFT signing status per round
  const { data: investorDocs } = await supabase
    .from("investor_documents")
    .select("round_id, doc_type, status")
    .eq("investor_id", investor.id)
    .eq("doc_type", "saft");

  // Build a set of round IDs with signed SAFTs
  const signedRoundIds = new Set(
    (investorDocs || [])
      .filter((d: any) => d.status === "signed")
      .map((d: any) => d.round_id)
  );

  const hasPartials = scaledPartials.length > 0;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome, {typedInvestor.full_name}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {(allAllocations || []).length > 0
            ? "Your $KAYAN token allocation overview"
            : "Complete your subscription to see your token allocations"}
        </p>
      </div>

      {/* Amount Due Banner — links to payment section */}
      {amountDue > 0 && (
        <a href="#payments" className="block bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-center justify-between hover:border-amber-300 transition-colors">
          <div>
            <p className="text-sm font-semibold text-amber-800">
              {hasPartials ? "Remaining Balance" : "Payment Due"}
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              {hasPartials
                ? "A partial payment has been received. Complete payment below to unlock your full allocation."
                : "Use the payment section below to remit payment and confirm your token allocation."}
            </p>
          </div>
          <p className="text-2xl font-bold text-amber-900 whitespace-nowrap ml-4">
            ${amountDue.toLocaleString()}
          </p>
        </a>
      )}

      {/* PQ Update Prompt — shown when new allocation added after PQ approval */}
      {typedInvestor.pq_status === "approved" && typedInvestor.pq_update_prompted_at && (
        <a href="/pq" className="block bg-amber-50 border border-amber-300 rounded-lg p-4 flex items-center gap-3 hover:border-amber-400 transition-colors">
          <span className="text-lg">📋</span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800">Questionnaire update requested</p>
            <p className="text-xs text-amber-600 mt-0.5">
              A new allocation has been added. Please review and resubmit your Purchaser Questionnaire for re-approval.
            </p>
          </div>
          <span className="text-amber-600 text-sm font-medium">Update →</span>
        </a>
      )}

      {/* Payment Flow — interactive payment submission */}
      <PaymentFlow />

      {/* Summary Stats */}
      <StatCards
        allocations={typedAllocations}
        kycStatus={typedInvestor.kyc_status}
      />

      {/* Allocation Details — shows ALL allocations with status indicators */}
      <AllocationTable
        allocations={(allAllocations || []) as AllocationWithRound[]}
        investorStatus={{
          kycVerified: typedInvestor.kyc_status === "verified",
          pqApproved: typedInvestor.pq_status === "approved",
          docsSent: !!typedInvestor.docs_sent_at,
          signedRoundIds,
        }}
      />

      {/* Vesting Schedule Chart */}
      <VestingChart confirmed={typedAllocations} unconfirmed={unconfirmedAllocations} />

      {/* KYC Verification */}
      <SumsubKycWidget
        kycStatus={typedInvestor.kyc_status}
        investorName={typedInvestor.full_name}
      />

      {/* Wallet (disabled until TGE) */}
      <WalletSection walletAddress={typedInvestor.wallet_address} />
    </div>
  );
}
