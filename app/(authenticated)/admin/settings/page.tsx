"use client";

import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Tabs, TabPanel } from "@/components/ui/Tabs";
import { EntityBrandingPanel } from "@/components/admin/EntityBrandingPanel";
import { PaymentSettingsAdmin } from "@/components/admin/PaymentSettingsAdmin";
import { PlatformPauseCard } from "@/components/admin/PlatformPauseCard";
import { ReminderCard } from "@/components/admin/ReminderCard";
import RegistryAuditLog from "@/components/admin/RegistryAuditLog";
import PqTemplateEditor from "@/components/admin/PqTemplateEditor";
import { MaterialEventsCard } from "@/components/admin/MaterialEventsCard";
import { FsaReportCard } from "@/components/admin/FsaReportCard";
import { RecertificationCard } from "@/components/admin/RecertificationCard";

// ─── Tab definitions ─────────────────────────────────────────

const TABS = [
  { id: "operations", label: "Operations" },
  { id: "compliance", label: "Compliance" },
  { id: "branding", label: "Branding" },
];

// ─── Inner component (needs Suspense for useSearchParams) ────

function SettingsInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialTab = searchParams.get("tab") || "operations";
  const [activeTab, setActiveTab] = useState(initialTab);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    router.replace(`/admin/settings?tab=${tab}`, { scroll: false });
  };

  return (
    <>
      <Tabs tabs={TABS} active={activeTab} onChange={handleTabChange} />

      <TabPanel id="operations" active={activeTab}>
        <div className="space-y-8">
          <PlatformPauseCard />
          <PaymentSettingsAdmin />
          <ReminderCard />
          <RegistryAuditLog />
        </div>
      </TabPanel>

      <TabPanel id="compliance" active={activeTab}>
        <div className="space-y-8">
          <PqTemplateEditor />
          <RecertificationCard />
          <MaterialEventsCard />
          <FsaReportCard />
        </div>
      </TabPanel>

      <TabPanel id="branding" active={activeTab}>
        <EntityBrandingPanel />
      </TabPanel>
    </>
  );
}

// ─── Page ────────────────────────────────────────────────────

/**
 * /admin/settings — Platform settings hub
 *
 * Operations tab: platform pause, payment methods, wallets, reminders
 * Branding tab: entity name, logos, colors, contact info
 */
export default function AdminSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Platform Settings</h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage platform operations and branding
        </p>
      </div>

      <Suspense>
        <SettingsInner />
      </Suspense>
    </div>
  );
}
