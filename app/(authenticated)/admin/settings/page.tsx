import { AlertSettings } from "@/components/admin/AlertSettings";
import { PaymentSettingsAdmin } from "@/components/admin/PaymentSettingsAdmin";
import { PlatformPauseCard } from "@/components/admin/PlatformPauseCard";

/**
 * /admin/settings — Admin-specific preferences
 *
 * Houses platform pause, payment configuration, and email alert subscriptions.
 */
export default function AdminSettingsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Admin Settings</h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage platform status, payment methods, wallets, and notification preferences
        </p>
      </div>

      <PlatformPauseCard />

      <PaymentSettingsAdmin />

      <AlertSettings />
    </div>
  );
}
