"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PqBadge, KycBadge } from "@/components/ui/Badge";
import {
  PqTemplateSection,
  PqTemplateField,
  PqShowWhen,
  PqDynamicFormData,
  validatePqData,
  checkShowWhen,
} from "@/lib/pq-template";

// ── Styling ──
const inputCls =
  "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-gray-100 disabled:text-gray-500";
const selectCls = `${inputCls} bg-white`;
const checkCls =
  "h-4 w-4 text-brand-600 border-gray-300 rounded focus:ring-brand-500 disabled:opacity-50";
const labelCls = "block text-sm font-medium text-gray-700 mb-1";

// ── Dynamic Field Renderer ──

function DynamicField({
  field, value, onChange, disabled,
}: {
  field: PqTemplateField; value: any; onChange: (val: any) => void; disabled: boolean;
}) {
  switch (field.type) {
    case "text":
      return (
        <div>
          <label className={labelCls}>{field.label}</label>
          <input type="text" value={value || ""} onChange={(e) => onChange(e.target.value)} disabled={disabled} placeholder={field.placeholder} className={inputCls} />
          {field.help_text && <p className="text-xs text-gray-400 mt-1">{field.help_text}</p>}
        </div>
      );
    case "textarea":
      return (
        <div>
          <label className={labelCls}>{field.label}</label>
          <textarea value={value || ""} onChange={(e) => onChange(e.target.value)} disabled={disabled} rows={3} placeholder={field.placeholder} className={`${inputCls} resize-none`} />
          {field.help_text && <p className="text-xs text-gray-400 mt-1">{field.help_text}</p>}
        </div>
      );
    case "number":
      return (
        <div>
          <label className={labelCls}>{field.label}</label>
          <input type="number" value={value ?? ""} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : "")} disabled={disabled} placeholder={field.placeholder} className={inputCls} />
          {field.help_text && <p className="text-xs text-gray-400 mt-1">{field.help_text}</p>}
        </div>
      );
    case "date":
      return (
        <div>
          <label className={labelCls}>{field.label}</label>
          <input type="date" value={value || ""} onChange={(e) => onChange(e.target.value)} disabled={disabled} className={inputCls} />
        </div>
      );
    case "select": {
      const options = field.options || [];
      const hasMatch = options.some((o) => o.value === value);
      return (
        <div>
          <label className={labelCls}>{field.label}</label>
          <select value={hasMatch ? value : ""} onChange={(e) => onChange(e.target.value)} disabled={disabled} className={selectCls}>
            <option value="" disabled>— Select —</option>
            {options.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
          {!hasMatch && value && (
            <p className="text-xs text-amber-600 mt-1">Previous value "{value}" needs to be re-selected from the dropdown.</p>
          )}
          {field.help_text && <p className="text-xs text-gray-400 mt-1">{field.help_text}</p>}
        </div>
      );
    }
    case "radio": {
      const radioOptions = field.options || [];
      const radioHasMatch = !value || radioOptions.some((o) => o.value === value);
      return (
        <div className="space-y-3">
          <label className={labelCls}>{field.label}</label>
          {!radioHasMatch && value && (
            <p className="text-xs text-amber-600">Previous value &quot;{value}&quot; is no longer available. Please re-select.</p>
          )}
          {radioOptions.map((opt) => (
            <label key={opt.value} className="flex items-start gap-3 cursor-pointer">
              <input type="radio" name={field.id} value={opt.value} checked={value === opt.value} onChange={() => onChange(opt.value)} disabled={disabled}
                className="mt-0.5 h-4 w-4 text-brand-600 border-gray-300 focus:ring-brand-500" />
              <span className="text-sm text-gray-700">{opt.label}</span>
            </label>
          ))}
        </div>
      );
    }
    case "checkbox":
      return (
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} disabled={disabled} className={`${checkCls} mt-0.5`} />
          <div>
            <span className="text-sm text-gray-700 leading-snug">{field.label}</span>
            {field.help_text && <p className="text-xs text-gray-400 mt-0.5">{field.help_text}</p>}
          </div>
        </label>
      );
    case "file":
      return (
        <div>
          <label className={labelCls}>{field.label}</label>
          {value && <p className="text-xs text-emerald-600 mb-1">File uploaded ✓</p>}
          <input
            type="file"
            accept={field.accept || ".pdf,.jpg,.jpeg,.png"}
            disabled={disabled}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const formPayload = new FormData();
              formPayload.append("file", file);
              formPayload.append("field_id", field.id);
              try {
                const res = await fetch("/api/investor/pq/upload", { method: "POST", body: formPayload });
                if (res.ok) {
                  const { path } = await res.json();
                  onChange(path);
                } else {
                  alert("Upload failed. Please try again.");
                }
              } catch { alert("Upload failed."); }
            }}
            className="text-sm text-gray-700 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100"
          />
          {field.help_text && <p className="text-xs text-gray-400 mt-1">{field.help_text}</p>}
        </div>
      );
    default:
      return null;
  }
}

// ── Conditional visibility (delegates to lib/pq-template) ──
function isFieldVisible(field: PqTemplateField, data: PqDynamicFormData): boolean {
  return checkShowWhen(field.show_when, data);
}

function isSectionVisible(section: PqTemplateSection, data: PqDynamicFormData): boolean {
  return checkShowWhen(section.show_when, data);
}

// ═══════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════

export default function PurchaserQuestionnairePage() {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [pqStatus, setPqStatus] = useState("");
  const [kycStatus, setKycStatus] = useState("");
  const [investorName, setInvestorName] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");
  const [pqUpdatePrompted, setPqUpdatePrompted] = useState(false);
  const [editingApproved, setEditingApproved] = useState(false);
  const [hasExistingData, setHasExistingData] = useState(false);

  const [sections, setSections] = useState<PqTemplateSection[]>([]);
  const [formData, setFormData] = useState<PqDynamicFormData>({});
  const [signatureName, setSignatureName] = useState("");
  const [signatureDate, setSignatureDate] = useState(new Date().toISOString().split("T")[0]);

  const setField = (fieldId: string, value: any) => {
    setFormData((prev) => ({ ...prev, [fieldId]: value }));
  };

  // ── Load ──
  useEffect(() => {
    fetch("/api/investor/pq")
      .then((r) => r.json())
      .then((data) => {
        setPqStatus(data.pq_status || "not_sent");
        setKycStatus(data.kyc_status || "unverified");
        setInvestorName(data.full_name || "");
        setReviewNotes(data.pq_notes || "");
        setPqUpdatePrompted(!!data.pq_update_prompted_at);

        // Template: DB or fallback
        setSections(data.template?.sections || []);

        // Pre-fill from existing data
        if (data.pq_data) {
          setHasExistingData(true);
          const d = data.pq_data;
          if (d.section_a) {
            // Legacy nested → flatten
            const flat: PqDynamicFormData = {};
            for (const val of Object.values(d)) {
              if (typeof val === "object" && val !== null && !Array.isArray(val)) Object.assign(flat, val);
            }
            setFormData(flat);
            setSignatureName(d.signature_name || data.full_name || "");
            setSignatureDate(d.signature_date || new Date().toISOString().split("T")[0]);
          } else {
            setFormData(d);
            setSignatureName(d.signature_name || data.full_name || "");
            setSignatureDate(d.signature_date || new Date().toISOString().split("T")[0]);
          }
        } else {
          setSignatureName(data.full_name || "");
          setFormData({
            legal_name: data.full_name || "",
            investor_type: "individual",
            qualification_type: "hk_professional_investor",
            payment_method: "wire",
          });
        }
      })
      .catch(() => toast.error("Failed to load PQ data"))
      .finally(() => setLoading(false));
  }, []);

  // ── Validate ──
  const validate = (): string | null => {
    const errors = validatePqData(sections, formData);
    if (errors.length > 0) return errors[0].message;
    if (!signatureName?.trim()) return "Signature name is required";
    return null;
  };

  // ── Submit ──
  const handleSubmit = async () => {
    const error = validate();
    if (error) { toast.error(error); return; }

    setSubmitting(true);
    const pq_data = { ...formData, signature_name: signatureName.trim(), signature_date: signatureDate };

    const res = await fetch("/api/investor/pq", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pq_data }),
    });

    setSubmitting(false);
    if (res.ok) {
      toast.success(editingApproved ? "Questionnaire resubmitted for re-approval" : "Purchaser Questionnaire submitted successfully");
      setPqStatus("submitted");
      setEditingApproved(false);
    } else {
      const err = await res.json();
      toast.error(err.error || "Submission failed");
    }
  };

  if (loading) return <div className="flex items-center justify-center min-h-[40vh]"><p className="text-gray-400">Loading...</p></div>;

  // ── KYC gate ──
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
              Complete identity verification first. Current status: <KycBadge status={kycStatus} />
            </p>
          </div>
        </Card>
      </div>
    );
  }

  const readOnly = pqStatus === "submitted" || (pqStatus === "approved" && !editingApproved);
  const canEdit = pqStatus === "sent" || pqStatus === "rejected" || pqStatus === "not_sent" || editingApproved;

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

      {/* Status banners */}
      {pqStatus === "approved" && !editingApproved && !pqUpdatePrompted && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-sm text-emerald-800 flex items-center justify-between">
          <span>Your Purchaser Questionnaire has been approved.</span>
          <button onClick={() => setEditingApproved(true)} className="text-xs font-medium text-brand-600 hover:text-brand-800 underline underline-offset-2">
            Update for re-approval →
          </button>
        </div>
      )}
      {pqStatus === "approved" && !editingApproved && pqUpdatePrompted && (
        <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 text-sm text-amber-800 flex items-center gap-3">
          <span className="text-lg">📋</span>
          <div className="flex-1">
            <p className="font-medium">Questionnaire update required — please resubmit</p>
            <p className="text-xs text-amber-600 mt-0.5">{reviewNotes || "The questionnaire has been updated. Please review and resubmit."}</p>
          </div>
          <button onClick={() => setEditingApproved(true)} className="shrink-0 px-3 py-1.5 bg-amber-600 text-white text-xs font-medium rounded-lg hover:bg-amber-700 transition-colors">
            Update Now
          </button>
        </div>
      )}
      {(pqStatus === "sent" || pqStatus === "not_sent") && pqUpdatePrompted && (
        <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 text-sm text-amber-800 flex items-center gap-3">
          <span className="text-lg">📋</span>
          <div className="flex-1">
            <p className="font-medium">Questionnaire update required — please complete and submit</p>
            <p className="text-xs text-amber-600 mt-0.5">{reviewNotes || "The questionnaire has been updated. Please review and submit."}</p>
          </div>
        </div>
      )}
      {editingApproved && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
          <strong>Editing mode:</strong> Your changes will require re-approval by an admin.
          <button onClick={() => setEditingApproved(false)} className="ml-3 text-xs font-medium text-amber-600 hover:text-amber-800 underline underline-offset-2">Cancel editing</button>
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

      {/* ═══ DYNAMIC SECTIONS ═══ */}
      {sections.map((section) => {
        if (!isSectionVisible(section, formData)) return null;
        return (
          <Card key={section.id}>
            <CardHeader title={section.title} subtitle={section.subtitle} />
            {section.description && <p className="text-xs text-gray-500 mb-4">{section.description}</p>}
            <div className="space-y-4">
              {section.fields.map((field) => {
                if (!isFieldVisible(field, formData)) return null;
                return <DynamicField key={field.id} field={field} value={formData[field.id]} onChange={(val) => setField(field.id, val)} disabled={readOnly} />;
              })}
            </div>
          </Card>
        );
      })}

      {/* ═══ SIGNATURE ═══ */}
      <Card>
        <CardHeader title="Execution" subtitle="Electronic signature" />
        <div className="space-y-4">
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
            {editingApproved ? "Resubmit for Re-Approval" : hasExistingData ? "Resubmit Questionnaire" : "Submit Questionnaire"}
          </Button>
          {editingApproved ? (
            <button onClick={() => setEditingApproved(false)} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
          ) : (
            <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-700">Back to Dashboard</Link>
          )}
        </div>
      )}
    </div>
  );
}
