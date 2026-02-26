"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PqBadge, KycBadge } from "@/components/ui/Badge";
import {
  PqFormData,
  PqSectionA,
  PqSectionB,
  PqSectionC,
  PqSectionD,
  PqSectionE,
  PqSectionF,
  PaymentMethod,
  QUALIFICATION_LABELS,
} from "@/lib/types";

// ── Styling helpers ──
const inputCls =
  "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-kayan-500 disabled:bg-gray-100 disabled:text-gray-500";
const selectCls = `${inputCls} bg-white`;
const checkCls = "h-4 w-4 text-kayan-600 border-gray-300 rounded focus:ring-kayan-500 disabled:opacity-50";
const labelCls = "block text-sm font-medium text-gray-700 mb-1";
const sectionCls = "space-y-4";

/** Styled checkbox row */
function Check({
  checked, onChange, label, disabled,
}: {
  checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className={`${checkCls} mt-0.5`}
      />
      <span className="text-sm text-gray-700 leading-snug">{label}</span>
    </label>
  );
}

export default function PurchaserQuestionnairePage() {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [pqStatus, setPqStatus] = useState("");
  const [kycStatus, setKycStatus] = useState("");
  const [investorName, setInvestorName] = useState("");
  const [investorEmail, setInvestorEmail] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");
  const [existingData, setExistingData] = useState<PqFormData | null>(null);

  // ── Form state (each section) ──
  const [sectionA, setSectionA] = useState<PqSectionA>({
    investor_type: "individual",
    legal_name: "",
    jurisdiction_of_residence: "",
  });
  const [sectionB, setSectionB] = useState<PqSectionB>({
    not_us_citizen: false,
    not_us_resident: false,
    not_us_partnership: false,
    not_us_estate: false,
    not_us_trust: false,
    not_purchasing_for_us_person: false,
  });
  const [sectionC, setSectionC] = useState<PqSectionC>({
    qualification_type: "hk_professional_investor",
  });
  const [sectionD, setSectionD] = useState<PqSectionD>({
    investment_amount_usd: 0,
    payment_method: "wire",
    source_of_funds: "",
    sanctions_confirmation: false,
  });
  const [sectionE, setSectionE] = useState<PqSectionE>({
    understands_restricted_security: false,
    understands_holding_period: false,
    understands_transfer_conditions: false,
    understands_no_hedging: false,
    accepts_indemnification: false,
  });
  const [sectionF, setSectionF] = useState<PqSectionF>({
    has_read_ppm: false,
    has_read_saft: false,
    has_read_cis: false,
    has_investment_experience: false,
    no_reliance_on_company: false,
  });
  const [signatureName, setSignatureName] = useState("");
  const [signatureDate, setSignatureDate] = useState(
    new Date().toISOString().split("T")[0]
  );

  // ── Load existing data ──
  useEffect(() => {
    fetch("/api/investor/pq")
      .then((r) => r.json())
      .then((data) => {
        setPqStatus(data.pq_status || "not_sent");
        setKycStatus(data.kyc_status || "unverified");
        setInvestorName(data.full_name || "");
        setInvestorEmail(data.email || "");
        setReviewNotes(data.pq_notes || "");

        // Pre-fill form if data exists (resubmission after rejection)
        if (data.pq_data) {
          setExistingData(data.pq_data);
          const d = data.pq_data as PqFormData;
          if (d.section_a) setSectionA(d.section_a);
          if (d.section_b) setSectionB(d.section_b);
          if (d.section_c) setSectionC(d.section_c);
          if (d.section_d) setSectionD(d.section_d);
          if (d.section_e) setSectionE(d.section_e);
          if (d.section_f) setSectionF(d.section_f);
          if (d.signature_name) setSignatureName(d.signature_name);
          if (d.signature_date) setSignatureDate(d.signature_date);
        } else {
          // Auto-fill name from investor record
          setSignatureName(data.full_name || "");
          setSectionA((a) => ({ ...a, legal_name: data.full_name || "" }));
        }
      })
      .catch(() => toast.error("Failed to load PQ data"))
      .finally(() => setLoading(false));
  }, []);

  // ── Validation ──
  const validate = (): string | null => {
    if (!sectionA.legal_name) return "Section A: Legal name is required";
    if (!sectionA.jurisdiction_of_residence) return "Section A: Jurisdiction of residence is required";

    const bChecks = Object.values(sectionB);
    if (bChecks.some((v) => !v)) return "Section B: All Non-U.S. Person certifications must be checked";

    if (!sectionD.investment_amount_usd || sectionD.investment_amount_usd <= 0)
      return "Section D: Investment amount is required";
    if (!sectionD.source_of_funds) return "Section D: Source of funds description is required";
    if (!sectionD.sanctions_confirmation)
      return "Section D: Sanctions confirmation is required";

    const eChecks = Object.values(sectionE);
    if (eChecks.some((v) => !v)) return "Section E: All transfer restriction acknowledgments must be checked";

    const fChecks = Object.values(sectionF);
    if (fChecks.some((v) => !v)) return "Section F: All general representations must be checked";

    if (!signatureName) return "Signature name is required";
    return null;
  };

  // ── Submit ──
  const handleSubmit = async () => {
    const error = validate();
    if (error) {
      toast.error(error);
      return;
    }

    setSubmitting(true);
    const pq_data: PqFormData = {
      section_a: sectionA,
      section_b: sectionB,
      section_c: sectionC,
      section_d: sectionD,
      section_e: sectionE,
      section_f: sectionF,
      signature_name: signatureName,
      signature_date: signatureDate,
    };

    const res = await fetch("/api/investor/pq", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pq_data }),
    });

    setSubmitting(false);
    if (res.ok) {
      toast.success("Purchaser Questionnaire submitted successfully");
      setPqStatus("submitted");
    } else {
      const err = await res.json();
      toast.error(err.error || "Submission failed");
    }
  };

  // ── Loading state ──
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  // ── KYC not verified — can't fill PQ yet ──
  if (kycStatus !== "verified") {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Purchaser Questionnaire</h1>
          <p className="text-sm text-gray-500 mt-1">Reg S qualification and compliance</p>
        </div>
        <Card>
          <div className="text-center py-12">
            <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">KYC Verification Required</h2>
            <p className="text-sm text-gray-500 max-w-md mx-auto">
              Your identity verification must be completed before you can fill out
              the Purchaser Questionnaire. Current status: <KycBadge status={kycStatus} />
            </p>
          </div>
        </Card>
      </div>
    );
  }

  // ── Already approved — read-only ──
  const readOnly = pqStatus === "approved" || pqStatus === "submitted";
  const canEdit = pqStatus === "sent" || pqStatus === "rejected" || pqStatus === "not_sent";

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Purchaser Questionnaire</h1>
          <p className="text-sm text-gray-500 mt-1">Reg S qualification and compliance documentation</p>
        </div>
        <PqBadge status={pqStatus} />
      </div>

      {/* Status messages */}
      {pqStatus === "approved" && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-sm text-emerald-800">
          Your Purchaser Questionnaire has been approved. No changes needed.
        </div>
      )}
      {pqStatus === "submitted" && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
          Your questionnaire is under review. You will be notified once the review is complete.
        </div>
      )}
      {pqStatus === "rejected" && reviewNotes && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
          <strong>Action required:</strong> {reviewNotes}
        </div>
      )}

      {/* ═══ SECTION A: Investor Identification ═══ */}
      <Card>
        <CardHeader title="Section A — Investor Identification" subtitle="Individual or entity information" />
        <div className={sectionCls}>
          <div>
            <label className={labelCls}>Investor Type</label>
            <select value={sectionA.investor_type} onChange={(e) => setSectionA({ ...sectionA, investor_type: e.target.value as "individual" | "entity" })} disabled={readOnly} className={selectCls}>
              <option value="individual">Individual</option>
              <option value="entity">Entity (Corporation, Fund, Trust, etc.)</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Legal Name</label>
            <input type="text" value={sectionA.legal_name} onChange={(e) => setSectionA({ ...sectionA, legal_name: e.target.value })} disabled={readOnly} placeholder="Full legal name as it appears on identification" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Jurisdiction of Residence / Incorporation</label>
            <input type="text" value={sectionA.jurisdiction_of_residence} onChange={(e) => setSectionA({ ...sectionA, jurisdiction_of_residence: e.target.value })} disabled={readOnly} placeholder="e.g., Hong Kong, Singapore, British Virgin Islands" className={inputCls} />
          </div>
          {sectionA.investor_type === "entity" && (
            <>
              <div>
                <label className={labelCls}>Entity Type</label>
                <input type="text" value={sectionA.entity_type || ""} onChange={(e) => setSectionA({ ...sectionA, entity_type: e.target.value })} disabled={readOnly} placeholder="e.g., Limited Company, Limited Partnership, Trust" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Entity Jurisdiction of Incorporation</label>
                <input type="text" value={sectionA.entity_jurisdiction || ""} onChange={(e) => setSectionA({ ...sectionA, entity_jurisdiction: e.target.value })} disabled={readOnly} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Beneficial Owner Name</label>
                <input type="text" value={sectionA.beneficial_owner_name || ""} onChange={(e) => setSectionA({ ...sectionA, beneficial_owner_name: e.target.value })} disabled={readOnly} placeholder="Name of ultimate beneficial owner (25%+ ownership)" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Beneficial Owner Nationality</label>
                <input type="text" value={sectionA.beneficial_owner_nationality || ""} onChange={(e) => setSectionA({ ...sectionA, beneficial_owner_nationality: e.target.value })} disabled={readOnly} className={inputCls} />
              </div>
            </>
          )}
        </div>
      </Card>

      {/* ═══ SECTION B: Non-U.S. Person Certification ═══ */}
      <Card>
        <CardHeader title="Section B — Non-U.S. Person Certification" subtitle="Rule 902(k) under Regulation S" />
        <p className="text-xs text-gray-500 mb-4">
          I certify that I am not a "U.S. Person" as defined under Rule 902(k) of Regulation S.
          All of the following must be true:
        </p>
        <div className="space-y-3">
          <Check checked={sectionB.not_us_citizen} onChange={(v) => setSectionB({ ...sectionB, not_us_citizen: v })} disabled={readOnly}
            label="I am not a natural person resident in the United States or a U.S. citizen" />
          <Check checked={sectionB.not_us_resident} onChange={(v) => setSectionB({ ...sectionB, not_us_resident: v })} disabled={readOnly}
            label="I am not a person whose principal residence or domicile is in the United States" />
          <Check checked={sectionB.not_us_partnership} onChange={(v) => setSectionB({ ...sectionB, not_us_partnership: v })} disabled={readOnly}
            label="I am not a partnership or corporation organized or incorporated under the laws of the United States" />
          <Check checked={sectionB.not_us_estate} onChange={(v) => setSectionB({ ...sectionB, not_us_estate: v })} disabled={readOnly}
            label="I am not an estate of which any executor or administrator is a U.S. Person" />
          <Check checked={sectionB.not_us_trust} onChange={(v) => setSectionB({ ...sectionB, not_us_trust: v })} disabled={readOnly}
            label="I am not a trust of which any trustee is a U.S. Person" />
          <Check checked={sectionB.not_purchasing_for_us_person} onChange={(v) => setSectionB({ ...sectionB, not_purchasing_for_us_person: v })} disabled={readOnly}
            label="I am not purchasing for the account or benefit of any U.S. Person" />
        </div>
      </Card>

      {/* ═══ SECTION C: Investor Qualification ═══ */}
      <Card>
        <CardHeader title="Section C — Investor Qualification" subtitle="Select the category that applies to you" />
        <div className="space-y-3">
          {Object.entries(QUALIFICATION_LABELS).map(([key, label]) => (
            <label key={key} className="flex items-start gap-3 cursor-pointer">
              <input
                type="radio"
                name="qualification"
                value={key}
                checked={sectionC.qualification_type === key}
                onChange={() => setSectionC({ ...sectionC, qualification_type: key as any })}
                disabled={readOnly}
                className="mt-0.5 h-4 w-4 text-kayan-600 border-gray-300 focus:ring-kayan-500"
              />
              <span className="text-sm text-gray-700">{label}</span>
            </label>
          ))}
          {sectionC.qualification_type === "other_qualified" && (
            <div className="ml-7">
              <input type="text" value={sectionC.other_jurisdiction_details || ""} onChange={(e) => setSectionC({ ...sectionC, other_jurisdiction_details: e.target.value })} disabled={readOnly} placeholder="Specify jurisdiction and qualification category" className={inputCls} />
            </div>
          )}
        </div>
      </Card>

      {/* ═══ SECTION D: Source of Funds & AML ═══ */}
      <Card>
        <CardHeader title="Section D — Source of Funds & AML" subtitle="Investment amount, payment method, and compliance" />
        <div className={sectionCls}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Investment Amount (USD)</label>
              <input type="number" value={sectionD.investment_amount_usd || ""} onChange={(e) => setSectionD({ ...sectionD, investment_amount_usd: Number(e.target.value) })} disabled={readOnly} placeholder="50000" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Payment Method</label>
              <select value={sectionD.payment_method} onChange={(e) => setSectionD({ ...sectionD, payment_method: e.target.value as PaymentMethod })} disabled={readOnly} className={selectCls}>
                <option value="wire">USD Wire Transfer</option>
                <option value="usdt">USDT (Tether)</option>
                <option value="usdc">USDC (USD Coin)</option>
                <option value="credit_card">Credit Card</option>
              </select>
            </div>
          </div>
          <div>
            <label className={labelCls}>Source of Funds</label>
            <textarea value={sectionD.source_of_funds} onChange={(e) => setSectionD({ ...sectionD, source_of_funds: e.target.value })} disabled={readOnly} rows={3} placeholder="Describe the origin of the funds being used for this investment (e.g., employment income, business profits, investment returns, family wealth)" className={`${inputCls} resize-none`} />
          </div>
          <Check checked={sectionD.sanctions_confirmation} onChange={(v) => setSectionD({ ...sectionD, sanctions_confirmation: v })} disabled={readOnly}
            label="I confirm that I am not subject to any sanctions administered by OFAC, the UN Security Council, the EU, or HM Treasury, and that the funds used for this investment are not derived from or connected to any sanctioned person, entity, or jurisdiction." />
        </div>
      </Card>

      {/* ═══ SECTION E: Transfer Restrictions ═══ */}
      <Card>
        <CardHeader title="Section E — Transfer Restrictions" subtitle="Acknowledgment of restricted security status" />
        <p className="text-xs text-gray-500 mb-4">
          I acknowledge and agree to the following transfer restrictions:
        </p>
        <div className="space-y-3">
          <Check checked={sectionE.understands_restricted_security} onChange={(v) => setSectionE({ ...sectionE, understands_restricted_security: v })} disabled={readOnly}
            label="I understand the Tokens are &quot;restricted securities&quot; as defined under U.S. securities law" />
          <Check checked={sectionE.understands_holding_period} onChange={(v) => setSectionE({ ...sectionE, understands_holding_period: v })} disabled={readOnly}
            label="I understand there is a minimum one-year holding period from the date of issuance" />
          <Check checked={sectionE.understands_transfer_conditions} onChange={(v) => setSectionE({ ...sectionE, understands_transfer_conditions: v })} disabled={readOnly}
            label="I understand any transfer must comply with applicable securities laws and may require prior written consent" />
          <Check checked={sectionE.understands_no_hedging} onChange={(v) => setSectionE({ ...sectionE, understands_no_hedging: v })} disabled={readOnly}
            label="I agree not to engage in hedging transactions with respect to the Tokens prior to the end of the applicable holding period" />
          <Check checked={sectionE.accepts_indemnification} onChange={(v) => setSectionE({ ...sectionE, accepts_indemnification: v })} disabled={readOnly}
            label="I agree to indemnify the Company against any losses arising from a breach of these representations" />
        </div>
      </Card>

      {/* ═══ SECTION F: General Representations ═══ */}
      <Card>
        <CardHeader title="Section F — General Representations" subtitle="Acknowledgment of offering documents and investment experience" />
        <div className="space-y-3">
          <Check checked={sectionF.has_read_ppm} onChange={(v) => setSectionF({ ...sectionF, has_read_ppm: v })} disabled={readOnly}
            label="I have received and read the Private Placement Memorandum (PPM)" />
          <Check checked={sectionF.has_read_saft} onChange={(v) => setSectionF({ ...sectionF, has_read_saft: v })} disabled={readOnly}
            label="I have received and read the Simple Agreement for Future Tokens (SAFT)" />
          <Check checked={sectionF.has_read_cis} onChange={(v) => setSectionF({ ...sectionF, has_read_cis: v })} disabled={readOnly}
            label="I have received and read the Company Information Sheet (CIS)" />
          <Check checked={sectionF.has_investment_experience} onChange={(v) => setSectionF({ ...sectionF, has_investment_experience: v })} disabled={readOnly}
            label="I have sufficient knowledge and experience in financial and business matters to evaluate the merits and risks of this investment" />
          <Check checked={sectionF.no_reliance_on_company} onChange={(v) => setSectionF({ ...sectionF, no_reliance_on_company: v })} disabled={readOnly}
            label="I have not relied on any representation or warranty by the Company or its agents other than those contained in the offering documents" />
        </div>
      </Card>

      {/* ═══ SECTION G: Execution ═══ */}
      <Card>
        <CardHeader title="Section G — Execution" subtitle="Electronic signature" />
        <div className={sectionCls}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Full Legal Name (as signature)</label>
              <input type="text" value={signatureName} onChange={(e) => setSignatureName(e.target.value)} disabled={readOnly} className={`${inputCls} font-medium`} />
            </div>
            <div>
              <label className={labelCls}>Date</label>
              <input type="date" value={signatureDate} onChange={(e) => setSignatureDate(e.target.value)} disabled={readOnly} className={inputCls} />
            </div>
          </div>
          <p className="text-xs text-gray-400">
            By entering your name above, you are electronically signing this Purchaser Questionnaire
            and certifying that all information provided is true and correct.
          </p>
        </div>
      </Card>

      {/* ═══ Submit ═══ */}
      {canEdit && (
        <div className="flex items-center gap-4 pb-8">
          <Button onClick={handleSubmit} loading={submitting}>
            {existingData ? "Resubmit Questionnaire" : "Submit Questionnaire"}
          </Button>
          <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-700">
            Back to Dashboard
          </Link>
        </div>
      )}
    </div>
  );
}
