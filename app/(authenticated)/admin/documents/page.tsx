"use client";

import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Tabs, TabPanel } from "@/components/ui/Tabs";
import { DocTemplatesPanel } from "@/components/admin/DocTemplatesPanel";
import { ReissuancePanel } from "@/components/admin/ReissuancePanel";

// ─── Tab definitions ─────────────────────────────────────────

const TABS = [
  { id: "templates", label: "Templates" },
  { id: "reissuance", label: "Re-issuance" },
];

// ─── Inner component (needs Suspense for useSearchParams) ────

function DocumentsInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialTab = searchParams.get("tab") || "templates";
  const [activeTab, setActiveTab] = useState(initialTab);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    router.replace(`/admin/documents?tab=${tab}`, { scroll: false });
  };

  return (
    <>
      <Tabs tabs={TABS} active={activeTab} onChange={handleTabChange} />

      <TabPanel id="templates" active={activeTab}>
        <DocTemplatesPanel />
      </TabPanel>

      <TabPanel id="reissuance" active={activeTab}>
        <ReissuancePanel />
      </TabPanel>
    </>
  );
}

// ─── Page ────────────────────────────────────────────────────

/**
 * /admin/documents — Document management hub
 *
 * Templates tab: upload and manage SAFT, PPM, CIS, Novation templates
 * Re-issuance tab: create and manage re-issuance batches
 */
export default function AdminDocumentsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Documents</h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage document templates and re-issuance workflows
        </p>
      </div>

      <Suspense>
        <DocumentsInner />
      </Suspense>
    </div>
  );
}
