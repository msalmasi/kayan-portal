import { AlertSettings } from "@/components/admin/AlertSettings";

/**
 * /admin/settings — Admin-specific preferences
 *
 * Currently houses email alert subscriptions.
 * Future: webhook config, export settings, etc.
 */
export default function AdminSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Admin Settings</h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage your notification preferences and admin configuration
        </p>
      </div>

      <AlertSettings />
    </div>
  );
}
