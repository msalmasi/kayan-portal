import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase-server";
import { AllocationWithRound, Investor } from "@/lib/types";
import { StatCards } from "@/components/dashboard/StatCards";
import { AllocationTable } from "@/components/dashboard/AllocationTable";
import { VestingChart } from "@/components/dashboard/VestingChart";
import { KycSection, WalletSection } from "@/components/dashboard/Placeholders";

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

  // Fetch paid allocations (fully confirmed)
  const { data: paidAllocations } = await supabase
    .from("allocations")
    .select("*, saft_rounds(*)")
    .eq("investor_id", investor.id)
    .eq("payment_status", "paid");

  // Fetch partial allocations (some payment received)
  const { data: partialAllocations } = await supabase
    .from("allocations")
    .select("*, saft_rounds(*)")
    .eq("investor_id", investor.id)
    .eq("payment_status", "partial");

  // Fetch invoiced + partial for amount due banner
  const { data: outstandingAllocations } = await supabase
    .from("allocations")
    .select("amount_usd, amount_received_usd, token_amount, saft_rounds(name, token_price)")
    .eq("investor_id", investor.id)
    .in("payment_status", ["invoiced", "partial"]);

  // For partial allocations, scale token_amount to the paid proportion.
  // e.g. 100,000 tokens at $50k, $20k received → show 40,000 tokens
  const scaledPartials = (partialAllocations || []).map((a: any) => {
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

  const typedAllocations = [
    ...(paidAllocations || []),
    ...scaledPartials,
  ] as AllocationWithRound[];

  const typedInvestor = investor as Investor;

  // Calculate remaining balance: total due minus what's been received
  const amountDue = (outstandingAllocations || []).reduce((sum: number, a: any) => {
    const total = Number(a.amount_usd) || Number(a.token_amount) * Number(a.saft_rounds?.token_price || 0);
    const received = Number(a.amount_received_usd) || 0;
    return sum + (total - received);
  }, 0);

  const hasPartials = scaledPartials.length > 0;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome, {typedInvestor.full_name}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {typedAllocations.length > 0
            ? "Your $KAYAN token allocation overview"
            : "Complete your subscription to see your token allocations"}
        </p>
      </div>

      {/* Amount Due Banner */}
      {amountDue > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-amber-800">
              {hasPartials ? "Remaining Balance" : "Payment Due"}
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              {hasPartials
                ? "A partial payment has been received. Your confirmed tokens are shown below. The remaining allocation will unlock once the balance is settled."
                : "Please remit payment to complete your subscription. Your token allocation will appear once payment is confirmed."}
            </p>
          </div>
          <p className="text-2xl font-bold text-amber-900 whitespace-nowrap ml-4">
            ${amountDue.toLocaleString()}
          </p>
        </div>
      )}

      {/* Summary Stats */}
      <StatCards
        allocations={typedAllocations}
        kycStatus={typedInvestor.kyc_status}
      />

      {/* Allocation Details */}
      <AllocationTable allocations={typedAllocations} />

      {/* Vesting Schedule Chart */}
      <VestingChart allocations={typedAllocations} />

      {/* KYC & Wallet (disabled placeholders) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <KycSection status={typedInvestor.kyc_status} />
        <WalletSection walletAddress={typedInvestor.wallet_address} />
      </div>
    </div>
  );
}
