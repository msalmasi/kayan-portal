import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase-server";
import { Investor } from "@/lib/types";
import { Card, CardHeader } from "@/components/ui/Card";
import { KycBadge } from "@/components/ui/Badge";

/**
 * /settings — Display account info
 * Wallet and profile editing are disabled for now.
 */
export default async function SettingsPage() {
  const supabase = await createServerSupabase();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) redirect("/login");

  const { data: investor } = await supabase
    .from("investors")
    .select("*")
    .eq("email", user.email)
    .single();

  const inv = investor as Investor | null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">
          Account details and preferences
        </p>
      </div>

      <Card>
        <CardHeader title="Account Information" />

        <div className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-500">
              Full Name
            </label>
            <p className="mt-1 text-sm text-gray-900">
              {inv?.full_name || "—"}
            </p>
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-500">
              Email
            </label>
            <p className="mt-1 text-sm text-gray-900">{user.email}</p>
          </div>

          {/* KYC Status */}
          <div>
            <label className="block text-sm font-medium text-gray-500">
              Verification Status
            </label>
            <div className="mt-1">
              <KycBadge status={inv?.kyc_status || "unverified"} />
            </div>
          </div>

          {/* Wallet Address */}
          <div>
            <label className="block text-sm font-medium text-gray-500">
              Wallet Address
            </label>
            <div className="mt-1">
              {inv?.wallet_address ? (
                <p className="text-sm font-mono text-gray-900">
                  {inv.wallet_address}
                </p>
              ) : (
                <p className="text-sm text-gray-400 italic">
                  Not connected — wallet connection will be available after TGE
                </p>
              )}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
