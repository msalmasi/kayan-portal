"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PqBadge } from "@/components/ui/Badge";
import {
  PqFormData,
  PqReviewData,
  PqSectionReview,
  PqStatus,
  PQ_SECTION_LABELS,
  QUALIFICATION_LABELS,
  PAYMENT_METHOD_LABELS,
  emptyPqReview,
} from "@/lib/types";

// ─── Types ──────────────────────────────────────────────────

interface PqReviewChecklistProps {
  investorId: string;
  pqStatus: PqStatus;
  pqData: PqFormData | null;
  pqReview: PqReviewData | null;
  pqNotes: string | null;
  pqReviewedBy: string | null;
  pqReviewedAt: string | null;
  canWrite: boolean;
  onSave: (updates: {
    pq_status: PqStatus;
    pq_review: PqReviewData;
    pq_notes: string;
    pq_reviewed_by: string;
  }) => Promise<void>;
}

// ─── Helpers ────────────────────────────────────────────────

const JURISDICTION_LABELS: Record<string, string> = {
  MY: "Malaysia", HK: "Hong Kong", SG: "Singapore", VG: "BVI",
  KY: "Cayman Islands", AE: "UAE", GB: "United Kingdom", AU: "Australia",
  JP: "Japan", KR: "South Korea", TW: "Taiwan", TH: "Thailand",
  ID: "Indonesia", PH: "Philippines", IN: "India", CN: "China",
  CH: "Switzerland", DE: "Germany", FR: "France", NL: "Netherlands",
  LU: "Luxembourg", IE: "Ireland", CA: "Canada", NZ: "New Zealand",
  BN: "Brunei", MO: "Macau", OTHER: "Other",
};

const checkCls =
  "h-4 w-4 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500 disabled:opacity-50";

/** Renders a section review block: shows investor's data + approve checkbox + notes */
function SectionReviewBlock({
  sectionKey,
  review,
  onUpdate,
  children,
  disabled,
}: {
  sectionKey: string;
  review: PqSectionReview;
  onUpdate: (r: PqSectionReview) => void;
  children: React.ReactNode;
  disabled: boolean;
}) {
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Header with approve toggle */}
      <div className="flex items-center justify-between bg-gray-50 px-4 py-3 border-b border-gray-200">
        <span className="text-sm font-medium text-gray-700">
          {PQ_SECTION_LABELS[sectionKey] || sectionKey}
        </span>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={review.approved}
            onChange={(e) => onUpdate({ ...review, approved: e.target.checked })}
            disabled={disabled}
            className={checkCls}
          />
          <span className={`text-xs font-medium ${review.approved ? "text-emerald-700" : "text-gray-400"}`}>
            {review.approved ? "Approved" : "Pending"}
          </span>
        </label>
      </div>

      {/* Investor's submitted data */}
      <div className="px-4 py-3 text-sm text-gray-600 space-y-1">
        {children}
      </div>

      {/* Review notes */}
      <div className="px-4 pb-3">
        <input
          type="text"
          value={review.notes}
          onChange={(e) => onUpdate({ ...review, notes: e.target.value })}
          disabled={disabled}
          placeholder="Review notes (optional)..."
          className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs text-gray-600 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-gray-50"
        />
      </div>
    </div>
  );
}

/** Bool indicator */
function BoolVal({ value, label }: { value: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`inline-block w-2 h-2 rounded-full ${value ? "bg-emerald-400" : "bg-red-400"}`} />
      <span className={value ? "text-gray-700" : "text-red-600"}>{label}</span>
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────

export function PqReviewChecklist({
  investorId,
  pqStatus,
  pqData,
  pqReview: initialReview,
  pqNotes: initialNotes,
  pqReviewedBy,
  pqReviewedAt,
  canWrite,
  onSave,
}: PqReviewChecklistProps) {
  const [review, setReview] = useState<PqReviewData>(initialReview || emptyPqReview());
  const [overallNotes, setOverallNotes] = useState(initialNotes || "");
  const [saving, setSaving] = useState(false);

  // Sync when props change
  useEffect(() => {
    if (initialReview) setReview(initialReview);
    if (initialNotes) setOverallNotes(initialNotes);
  }, [initialReview, initialNotes]);

  // No PQ data submitted yet
  if (!pqData) {
    return (
      <Card>
        <CardHeader title="PQ Review" subtitle="Purchaser Questionnaire review checklist" />
        <div className="text-center py-8">
          <PqBadge status={pqStatus} />
          <p className="text-sm text-gray-400 mt-3">
            {pqStatus === "not_sent"
              ? "Subscription documents have not been sent yet."
              : pqStatus === "sent"
                ? "Waiting for the investor to complete and submit their PQ."
                : "No PQ data available."}
          </p>
        </div>
      </Card>
    );
  }

  // Normalize: if data is in flat format (no section_a key), reshape into nested
  const d: PqFormData = (() => {
    if (pqData?.section_a) return pqData; // already nested (legacy format)
    // Flat format → reconstruct nested structure
    const raw = pqData as Record<string, any> || {};
    return {
      section_a: {
        investor_type: raw.investor_type || "individual",
        legal_name: raw.legal_name || "",
        jurisdiction_of_residence: raw.jurisdiction_of_residence || "",
        entity_type: raw.entity_type,
        entity_jurisdiction: raw.entity_jurisdiction,
        beneficial_owner_name: raw.beneficial_owner_name,
        beneficial_owner_nationality: raw.beneficial_owner_nationality,
      },
      section_b: {
        not_us_citizen: !!raw.not_us_citizen,
        not_us_resident: !!raw.not_us_resident,
        not_us_partnership: !!raw.not_us_partnership,
        not_us_estate: !!raw.not_us_estate,
        not_us_trust: !!raw.not_us_trust,
        not_purchasing_for_us_person: !!raw.not_purchasing_for_us_person,
      },
      section_c: {
        qualification_type: raw.qualification_type || "hk_professional_investor",
        other_jurisdiction_details: raw.other_jurisdiction_details,
      },
      section_d: {
        is_grant: raw.is_grant,
        investment_amount_usd: raw.investment_amount_usd || 0,
        payment_method: raw.payment_method || "wire",
        source_of_funds: raw.source_of_funds || "",
        sanctions_confirmation: !!raw.sanctions_confirmation,
      },
      section_e: {
        understands_investment_contract: !!raw.understands_investment_contract,
        understands_transfer_restrictions: !!raw.understands_transfer_restrictions,
        understands_holding_period: !!raw.understands_holding_period,
        understands_no_hedging: !!raw.understands_no_hedging,
        understands_separation: !!raw.understands_separation,
        understands_separation_not_guaranteed: !!raw.understands_separation_not_guaranteed,
        accepts_indemnification: !!raw.accepts_indemnification,
        // Legacy
        understands_restricted_security: !!raw.understands_restricted_security,
        understands_transfer_conditions: !!raw.understands_transfer_conditions,
      },
      section_f: {
        has_read_ppm: !!raw.has_read_ppm,
        has_read_saft: !!raw.has_read_saft,
        has_read_cis: !!raw.has_read_cis,
        has_investment_experience: !!raw.has_investment_experience,
        no_reliance_on_company: !!raw.no_reliance_on_company,
      },
      section_g: {
        understands_not_equity: !!raw.understands_not_equity,
        understands_commodity_redemption: !!raw.understands_commodity_redemption,
        understands_protocol_utility: !!raw.understands_protocol_utility,
        understands_entity_separation: !!raw.understands_entity_separation,
        understands_commodity_risks: !!raw.understands_commodity_risks,
      },
      signature_name: raw.signature_name || "",
      signature_date: raw.signature_date || "",
    } as PqFormData;
  })();
  const allSectionsApproved = Object.keys(PQ_SECTION_LABELS).every((k) => {
    // Section G is optional — only require approval if data was submitted
    if (k === "section_g" && !d.section_g) return true;
    return review[k as keyof PqReviewData] && (review[k as keyof PqReviewData] as PqSectionReview).approved;
  });

  const updateSection = (key: string, val: PqSectionReview) => {
    setReview((r) => ({ ...r, [key]: val }));
  };

  const handleApproveAll = async () => {
    setSaving(true);
    await onSave({
      pq_status: "approved",
      pq_review: review,
      pq_notes: overallNotes,
      pq_reviewed_by: "admin",
    });
    setSaving(false);
  };

  const handleReject = async () => {
    if (!overallNotes.trim()) {
      alert("Please add notes explaining what needs to be corrected.");
      return;
    }
    setSaving(true);
    await onSave({
      pq_status: "rejected",
      pq_review: review,
      pq_notes: overallNotes,
      pq_reviewed_by: "admin",
    });
    setSaving(false);
  };

  const handleSaveDraft = async () => {
    setSaving(true);
    await onSave({
      pq_status: pqStatus,
      pq_review: review,
      pq_notes: overallNotes,
      pq_reviewed_by: "admin",
    });
    setSaving(false);
  };

  const disabled = !canWrite || pqStatus === "approved";

  return (
    <Card>
      <CardHeader title="PQ Review Checklist" subtitle="Review each section of the investor's submitted Purchaser Questionnaire" />

      <div className="space-y-4">
        {/* ── Section A ── */}
        <SectionReviewBlock
          sectionKey="section_a"
          review={review.section_a}
          onUpdate={(v) => updateSection("section_a", v)}
          disabled={disabled}
        >
          <p><strong>Type:</strong> {d.section_a.investor_type}</p>
          <p><strong>Name:</strong> {d.section_a.legal_name}</p>
          <p><strong>Jurisdiction:</strong> {JURISDICTION_LABELS[d.section_a.jurisdiction_of_residence] || d.section_a.jurisdiction_of_residence}</p>
          {d.section_a.investor_type === "entity" && (
            <>
              <p><strong>Entity Type:</strong> {d.section_a.entity_type || "—"}</p>
              <p><strong>Beneficial Owner:</strong> {d.section_a.beneficial_owner_name || "—"} ({d.section_a.beneficial_owner_nationality || "—"})</p>
            </>
          )}
        </SectionReviewBlock>

        {/* ── Section B ── */}
        <SectionReviewBlock
          sectionKey="section_b"
          review={review.section_b}
          onUpdate={(v) => updateSection("section_b", v)}
          disabled={disabled}
        >
          <BoolVal value={d.section_b.not_us_citizen} label="Not U.S. citizen/resident" />
          <BoolVal value={d.section_b.not_us_resident} label="Not U.S. domiciled" />
          <BoolVal value={d.section_b.not_us_partnership} label="Not U.S. partnership/corp" />
          <BoolVal value={d.section_b.not_us_estate} label="Not U.S. estate" />
          <BoolVal value={d.section_b.not_us_trust} label="Not U.S. trust" />
          <BoolVal value={d.section_b.not_purchasing_for_us_person} label="Not purchasing for U.S. person" />
        </SectionReviewBlock>

        {/* ── Section C ── */}
        <SectionReviewBlock
          sectionKey="section_c"
          review={review.section_c}
          onUpdate={(v) => updateSection("section_c", v)}
          disabled={disabled}
        >
          <p><strong>Qualification:</strong> {QUALIFICATION_LABELS[d.section_c.qualification_type] || d.section_c.qualification_type}</p>
          {d.section_c.other_jurisdiction_details && (
            <p><strong>Details:</strong> {d.section_c.other_jurisdiction_details}</p>
          )}
        </SectionReviewBlock>

        {/* ── Section D ── */}
        <SectionReviewBlock
          sectionKey="section_d"
          review={review.section_d}
          onUpdate={(v) => updateSection("section_d", v)}
          disabled={disabled}
        >
          {d.section_d.is_grant ? (
            <div className="bg-emerald-50 border border-emerald-100 rounded px-3 py-2">
              <p className="text-emerald-700 font-medium text-xs">Grant allocation — no payment required</p>
              <p className="text-gray-500 text-xs mt-0.5">Investment amount, payment method, and source of funds do not apply.</p>
            </div>
          ) : (
            <>
              <p><strong>Amount:</strong> ${d.section_d.investment_amount_usd?.toLocaleString() || "—"}</p>
              <p><strong>Method:</strong> {PAYMENT_METHOD_LABELS[d.section_d.payment_method] || d.section_d.payment_method}</p>
              <p><strong>Source:</strong> {d.section_d.source_of_funds || "—"}</p>
            </>
          )}
          <BoolVal value={d.section_d.sanctions_confirmation} label="Sanctions compliance confirmed" />
        </SectionReviewBlock>

        {/* ── Section E ── */}
        <SectionReviewBlock
          sectionKey="section_e"
          review={review.section_e}
          onUpdate={(v) => updateSection("section_e", v)}
          disabled={disabled}
        >
          <BoolVal value={d.section_e.understands_investment_contract} label="Understands SAFT is investment contract, token is commodity-protocol" />
          <BoolVal value={d.section_e.understands_transfer_restrictions} label="Understands transfer restrictions during investment contract period" />
          <BoolVal value={d.section_e.understands_holding_period} label="Understands Rule 144 holding period (U.S. resales) vs. Reg S offshore" />
          <BoolVal value={d.section_e.understands_no_hedging} label="Accepts no-hedging during distribution compliance period" />
          <BoolVal value={d.section_e.understands_separation} label="Understands separation mechanism and post-separation free trading" />
          <BoolVal value={d.section_e.understands_separation_not_guaranteed} label="Understands separation is milestone-dependent, not guaranteed" />
          <BoolVal value={d.section_e.accepts_indemnification} label="Accepts indemnification" />
          {/* Legacy fields (pre-restructuring PQ submissions) */}
          {d.section_e.understands_restricted_security && !d.section_e.understands_investment_contract && (
            <>
              <BoolVal value={d.section_e.understands_restricted_security} label="[Legacy] Understands restricted security status" />
              <BoolVal value={d.section_e.understands_transfer_conditions} label="[Legacy] Understands transfer conditions" />
            </>
          )}
        </SectionReviewBlock>

        {/* ── Section F ── */}
        <SectionReviewBlock
          sectionKey="section_f"
          review={review.section_f}
          onUpdate={(v) => updateSection("section_f", v)}
          disabled={disabled}
        >
          <BoolVal value={d.section_f.has_read_ppm} label="Read PPM (commodity-protocol framing)" />
          <BoolVal value={d.section_f.has_read_saft} label="Read SAFT (incl. separation milestones)" />
          <BoolVal value={d.section_f.has_read_cis} label="Read CIS (Kayan Protocol & Panoptes Exchange)" />
          <BoolVal value={d.section_f.has_investment_experience} label="Has investment experience (incl. commodity-protocol tokens)" />
          <BoolVal value={d.section_f.no_reliance_on_company} label="No reliance on company" />
        </SectionReviewBlock>

        {/* ── Section G: Commodity-Protocol Acknowledgments ── */}
        {d.section_g && (
          <SectionReviewBlock
            sectionKey="section_g"
            review={review.section_g || { approved: false, notes: "" }}
            onUpdate={(v) => updateSection("section_g", v)}
            disabled={disabled}
          >
            <BoolVal value={d.section_g.understands_not_equity} label="Understands $KYN is not equity, no dividends/distributions" />
            <BoolVal value={d.section_g.understands_commodity_redemption} label="Understands commodity redemption at market rates on Panoptes Exchange" />
            <BoolVal value={d.section_g.understands_protocol_utility} label="Understands protocol utility (staking, fees, governance)" />
            <BoolVal value={d.section_g.understands_entity_separation} label="Understands entity roles (Kayan Holdings / DIGITECH / Foundation / Panoptes)" />
            <BoolVal value={d.section_g.understands_commodity_risks} label="Understands risks (novel RWA separation, commodity classification, decentralization)" />
          </SectionReviewBlock>
        )}

        {/* ── Signature ── */}
        <div className="bg-gray-50 rounded-lg p-4 text-sm">
          <p className="text-gray-500 text-xs mb-1">Electronic Signature</p>
          <p className="font-medium text-gray-900">{d.signature_name}</p>
          <p className="text-gray-500 text-xs">{d.signature_date}</p>
        </div>

        {/* ── Overall notes ── */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Overall Review Notes
          </label>
          <textarea
            value={overallNotes}
            onChange={(e) => setOverallNotes(e.target.value)}
            disabled={disabled}
            rows={3}
            placeholder="Add any overall notes, issues, or rejection reasons..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-gray-100 resize-none"
          />
        </div>

        {/* ── Review metadata ── */}
        {pqReviewedAt && (
          <p className="text-xs text-gray-400">
            Reviewed by {pqReviewedBy || "—"} on {new Date(pqReviewedAt).toLocaleDateString()}
          </p>
        )}

        {/* ── Actions ── */}
        {canWrite && pqStatus !== "approved" && (
          <div className="flex items-center gap-3 pt-2">
            <Button
              onClick={handleApproveAll}
              loading={saving}
              disabled={!allSectionsApproved}
              className={!allSectionsApproved ? "opacity-50 cursor-not-allowed" : ""}
            >
              Approve PQ
            </Button>
            <Button variant="secondary" onClick={handleReject} loading={saving}>
              Reject / Request Changes
            </Button>
            <Button variant="ghost" size="sm" onClick={handleSaveDraft} loading={saving}>
              Save Draft
            </Button>
            {!allSectionsApproved && (
              <span className="text-xs text-gray-400">
                All sections must be individually approved before final approval.
              </span>
            )}
          </div>
        )}

        {pqStatus === "approved" && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-800">
            This PQ has been approved. Capital call has been issued.
          </div>
        )}
      </div>
    </Card>
  );
}
