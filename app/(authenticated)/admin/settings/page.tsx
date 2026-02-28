import { AlertSettings } from "@/components/admin/AlertSettings";
import { PaymentSettingsAdmin } from "@/components/admin/PaymentSettingsAdmin";

/**
 * /admin/settings — Admin-specific preferences
 *
 * Houses email alert subscriptions and payment configuration.
 */
export default function AdminSettingsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Admin Settings</h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage payment methods, wallets, and notification preferences
        </p>
      </div>

      <PaymentSettingsAdmin />

      <AlertSettings />
    </div>
  );
}
