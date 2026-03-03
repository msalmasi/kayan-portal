"use client";

import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Tabs, TabPanel } from "@/components/ui/Tabs";
import { EntityBrandingPanel } from "@/components/admin/EntityBrandingPanel";
import { AlertSettings } from "@/components/admin/AlertSettings";
import { PaymentSettingsAdmin } from "@/components/admin/PaymentSettingsAdmin";
import { PlatformPauseCard } from "@/components/admin/PlatformPauseCard";

// ─── Tab definitions ─────────────────────────────────────────

const TABS = [
  { id: "branding", label: "Branding" },
  { id: "operations", label: "Operations" },
  { id: "alerts", label: "Alerts" },
];

// ─── Inner component (needs Suspense for useSearchParams) ────

function SettingsInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialTab = searchParams.get("tab") || "branding";
  const [activeTab, setActiveTab] = useState(initialTab);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    router.replace(`/admin/settings?tab=${tab}`, { scroll: false });
  };

  return (
    <>
      <Tabs tabs={TABS} active={activeTab} onChange={handleTabChange} />

      <TabPanel id="branding" active={activeTab}>
        <EntityBrandingPanel />
      </TabPanel>

      <TabPanel id="operations" active={activeTab}>
        <div className="space-y-8">
          <PlatformPauseCard />
          <PaymentSettingsAdmin />
        </div>
      </TabPanel>

      <TabPanel id="alerts" active={activeTab}>
        <AlertSettings />
      </TabPanel>
    </>
  );
}

// ─── Page ────────────────────────────────────────────────────

/**
 * /admin/settings — Platform settings hub
 *
 * Branding tab: entity name, logos, colors, contact info
 * Operations tab: platform pause, payment methods, wallets
 * Alerts tab: email notification subscriptions
 */
export default function AdminSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Platform Settings</h1>
        <p className="text-sm text-gray-500 mt-1">
          Configure branding, operations, and notification preferences
        </p>
      </div>

      <Suspense>
        <SettingsInner />
      </Suspense>
    </div>
  );
}
