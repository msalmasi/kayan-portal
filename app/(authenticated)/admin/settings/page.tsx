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
import { useEntity } from "@/components/EntityConfigProvider";

// ─── Tab definitions ─────────────────────────────────────────

const TABS = [
  { id: "operations", label: "Operations" },
  { id: "compliance", label: "Compliance" },
  { id: "issuer", label: "Issuer" },
];

// ─── Jurisdiction labels ─────────────────────────────────────

const JURISDICTION_LABELS: Record<string, string> = {
  LB: "Labuan FSA",
  KY: "Cayman Islands (CIMA)",
  VG: "British Virgin Islands (FSC)",
  SG: "Monetary Authority of Singapore",
  HK: "Hong Kong SFC",
  AE: "UAE / DIFC",
  GB: "United Kingdom (FCA)",
  CH: "Switzerland (FINMA)",
};

// ─── Inner component (needs Suspense for useSearchParams) ────

function SettingsInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const entity = useEntity();
  const initialTab = searchParams.get("tab") || "operations";
  const [activeTab, setActiveTab] = useState(initialTab);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    router.replace(`/admin/settings?tab=${tab}`, { scroll: false });
  };

  const jurisdiction = entity?.issuer_jurisdiction || "";

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
          {/* Universal — all jurisdictions */}
          <PqTemplateEditor />
          <RecertificationCard />

          {/* Labuan FSA */}
          {jurisdiction === "LB" && (
            <>
              <div className="border-t border-gray-200 pt-6">
                <h3 className="text-sm font-semibold text-gray-700 mb-1">Labuan FSA Compliance</h3>
                <p className="text-xs text-gray-400 mb-4">
                  Required reporting and notification workflows for the Labuan Financial Services Authority
                </p>
              </div>
              <MaterialEventsCard />
              <FsaReportCard />
            </>
          )}

          {/* No jurisdiction set */}
          {!jurisdiction && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-6 text-center">
              <p className="text-sm text-gray-500 mb-1">No issuer jurisdiction configured</p>
              <p className="text-xs text-gray-400">
                Set the issuer jurisdiction in the <strong>Issuer</strong> tab to enable jurisdiction-specific compliance features.
              </p>
            </div>
          )}

          {/* Other jurisdictions (future) */}
          {jurisdiction && jurisdiction !== "LB" && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-6 text-center">
              <p className="text-sm text-gray-500 mb-1">
                {JURISDICTION_LABELS[jurisdiction] || jurisdiction} compliance
              </p>
              <p className="text-xs text-gray-400">
                Jurisdiction-specific compliance features for {JURISDICTION_LABELS[jurisdiction] || jurisdiction} will be available in a future update.
              </p>
            </div>
          )}
        </div>
      </TabPanel>

      <TabPanel id="issuer" active={activeTab}>
        <EntityBrandingPanel />
      </TabPanel>
    </>
  );
}

// ─── Page ────────────────────────────────────────────────────

export default function AdminSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Platform Settings</h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage platform operations, compliance, and issuer configuration
        </p>
      </div>

      <Suspense>
        <SettingsInner />
      </Suspense>
    </div>
  );
}
