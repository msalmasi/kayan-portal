/**
 * PQ Template Types & Default Seed
 *
 * Defines the schema for dynamic, admin-editable Purchaser
 * Questionnaires. The default template replicates the original
 * hard-coded Reg S PQ structure exactly.
 */

// ── Field Types ──

export type PqFieldType =
  | "text"
  | "textarea"
  | "number"
  | "select"
  | "radio"
  | "checkbox"
  | "date";

export interface PqFieldOption {
  value: string;
  label: string;
}

export interface PqTemplateField {
  id: string;                          // unique key, e.g. "legal_name"
  type: PqFieldType;
  label: string;
  placeholder?: string;
  required?: boolean;                  // true = must be filled / checked
  options?: PqFieldOption[];           // for select / radio
  show_when?: { field: string; value: any }; // conditional visibility
  help_text?: string;                  // small text below field
}

export interface PqTemplateSection {
  id: string;                          // e.g. "section_a"
  title: string;
  subtitle?: string;
  description?: string;                // longer explanatory block
  fields: PqTemplateField[];
}

export interface PqTemplate {
  id: string;
  version: number;
  name: string;
  sections: PqTemplateSection[];
  is_active: boolean;
  created_at: string;
  created_by: string;
  notes?: string;
}

// ── Flat form data: { field_id: value } ──
export type PqDynamicFormData = Record<string, any>;

// ── Validation ──

export interface PqValidationError {
  fieldId: string;
  sectionId: string;
  message: string;
}

/**
 * Validate investor form data against a template.
 * Returns array of errors (empty = valid).
 */
export function validatePqData(
  template: PqTemplateSection[],
  data: PqDynamicFormData
): PqValidationError[] {
  const errors: PqValidationError[] = [];

  for (const section of template) {
    for (const field of section.fields) {
      // Check conditional visibility
      if (field.show_when) {
        const depVal = data[field.show_when.field];
        // Special handling for "show when X is false" (e.g., show investment fields when is_grant is unchecked)
        if (field.show_when.value === false) {
          if (depVal) continue; // field hidden because dependency is truthy
        } else {
          if (depVal !== field.show_when.value) continue; // field not visible, skip
        }
      }

      if (!field.required) continue;

      const val = data[field.id];

      if (field.type === "checkbox") {
        if (!val) {
          errors.push({ fieldId: field.id, sectionId: section.id, message: `${field.label} must be checked` });
        }
      } else if (field.type === "number") {
        if (val === undefined || val === null || val === "" || val <= 0) {
          errors.push({ fieldId: field.id, sectionId: section.id, message: `${field.label} is required` });
        }
      } else {
        if (!val || (typeof val === "string" && !val.trim())) {
          errors.push({ fieldId: field.id, sectionId: section.id, message: `${field.label} is required` });
        }
      }
    }
  }

  return errors;
}

// ═══════════════════════════════════════════════════════════
// DEFAULT TEMPLATE — replicates the original hard-coded PQ
// ═══════════════════════════════════════════════════════════

export const DEFAULT_PQ_SECTIONS: PqTemplateSection[] = [
  // ── Section A: Investor Identification ──
  {
    id: "section_a",
    title: "Section A — Investor Identification",
    subtitle: "Individual or entity information",
    fields: [
      {
        id: "investor_type",
        type: "select",
        label: "Investor Type",
        required: true,
        options: [
          { value: "individual", label: "Individual" },
          { value: "entity", label: "Entity (Corporation, Fund, Trust, etc.)" },
        ],
      },
      {
        id: "legal_name",
        type: "text",
        label: "Legal Name",
        placeholder: "Full legal name as it appears on identification",
        required: true,
      },
      {
        id: "jurisdiction_of_residence",
        type: "text",
        label: "Jurisdiction of Residence / Incorporation",
        placeholder: "e.g., Hong Kong, Singapore, British Virgin Islands",
        required: true,
      },
      {
        id: "entity_type",
        type: "text",
        label: "Entity Type",
        placeholder: "e.g., Limited Company, Limited Partnership, Trust",
        show_when: { field: "investor_type", value: "entity" },
      },
      {
        id: "entity_jurisdiction",
        type: "text",
        label: "Entity Jurisdiction of Incorporation",
        show_when: { field: "investor_type", value: "entity" },
      },
      {
        id: "beneficial_owner_name",
        type: "text",
        label: "Beneficial Owner Name",
        placeholder: "Name of ultimate beneficial owner (25%+ ownership)",
        show_when: { field: "investor_type", value: "entity" },
      },
      {
        id: "beneficial_owner_nationality",
        type: "text",
        label: "Beneficial Owner Nationality",
        show_when: { field: "investor_type", value: "entity" },
      },
    ],
  },

  // ── Section B: Non-U.S. Person Certification ──
  {
    id: "section_b",
    title: "Section B — Non-U.S. Person Certification",
    subtitle: "Rule 902(k) under Regulation S",
    description: "I certify that I am not a \"U.S. Person\" as defined under Rule 902(k) of Regulation S. All of the following must be true:",
    fields: [
      { id: "not_us_citizen", type: "checkbox", required: true, label: "I am not a natural person resident in the United States or a U.S. citizen" },
      { id: "not_us_resident", type: "checkbox", required: true, label: "I am not a person whose principal residence or domicile is in the United States" },
      { id: "not_us_partnership", type: "checkbox", required: true, label: "I am not a partnership or corporation organized or incorporated under the laws of the United States" },
      { id: "not_us_estate", type: "checkbox", required: true, label: "I am not an estate of which any executor or administrator is a U.S. Person" },
      { id: "not_us_trust", type: "checkbox", required: true, label: "I am not a trust of which any trustee is a U.S. Person" },
      { id: "not_purchasing_for_us_person", type: "checkbox", required: true, label: "I am not purchasing for the account or benefit of any U.S. Person" },
    ],
  },

  // ── Section C: Investor Qualification ──
  {
    id: "section_c",
    title: "Section C — Investor Qualification",
    subtitle: "Select the category that applies to you",
    fields: [
      {
        id: "qualification_type",
        type: "radio",
        label: "Qualification Category",
        required: true,
        options: [
          { value: "hk_professional_investor", label: "Hong Kong Professional Investor" },
          { value: "sg_accredited_investor", label: "Singapore Accredited Investor" },
          { value: "bvi_qualified", label: "BVI Qualified Purchaser" },
          { value: "uae_difc_qualified", label: "UAE / DIFC Qualified Investor" },
          { value: "other_qualified", label: "Other Qualified Investor" },
        ],
      },
      {
        id: "other_jurisdiction_details",
        type: "text",
        label: "Jurisdiction & Qualification Details",
        placeholder: "Specify jurisdiction and qualification category",
        show_when: { field: "qualification_type", value: "other_qualified" },
      },
    ],
  },

  // ── Section D: Source of Funds & AML ──
  {
    id: "section_d",
    title: "Section D — Source of Funds & AML",
    subtitle: "Investment amount, payment method, and compliance",
    fields: [
      {
        id: "is_grant",
        type: "checkbox",
        label: "This allocation is a grant (no investment payment required)",
        help_text: "If checked, investment amount, payment method, and source of funds do not apply.",
      },
      {
        id: "investment_amount_usd",
        type: "number",
        label: "Investment Amount (USD)",
        placeholder: "50000",
        required: true,
        show_when: { field: "is_grant", value: false },
      },
      {
        id: "payment_method",
        type: "select",
        label: "Payment Method",
        required: true,
        show_when: { field: "is_grant", value: false },
        options: [
          { value: "wire", label: "USD Wire Transfer" },
          { value: "usdt", label: "USDT (Tether)" },
          { value: "usdc", label: "USDC (USD Coin)" },
          { value: "credit_card", label: "Credit Card" },
        ],
      },
      {
        id: "source_of_funds",
        type: "textarea",
        label: "Source of Funds",
        placeholder: "Describe the origin of the funds being used for this investment (e.g., employment income, business profits, investment returns, family wealth)",
        required: true,
        show_when: { field: "is_grant", value: false },
      },
      {
        id: "sanctions_confirmation",
        type: "checkbox",
        required: true,
        label: "I confirm that I am not subject to any sanctions administered by OFAC, the UN Security Council, the EU, or HM Treasury, and that the funds used for this investment are not derived from or connected to any sanctioned person, entity, or jurisdiction.",
      },
    ],
  },

  // ── Section E: Transfer Restrictions ──
  {
    id: "section_e",
    title: "Section E — Transfer Restrictions",
    subtitle: "Acknowledgment of restricted security status and resale limitations",
    description: "I acknowledge and agree to the following transfer restrictions. Note: The Tokens are being offered under Regulation S of the U.S. Securities Act, which permits sales to non-U.S. persons in offshore transactions.",
    fields: [
      { id: "understands_restricted_security", type: "checkbox", required: true, label: "I understand the Tokens are \"restricted securities\" as defined under U.S. securities law and have not been registered under the Securities Act" },
      { id: "understands_holding_period", type: "checkbox", required: true, label: "I understand that under Rule 144, any resale of the Tokens to U.S. persons or into the U.S. market is subject to a minimum one-year holding period from the date of issuance. This restriction does not apply to compliant offshore resales under Regulation S." },
      { id: "understands_transfer_conditions", type: "checkbox", required: true, label: "I understand any transfer must comply with applicable securities laws (including Regulation S for offshore transactions and Rule 144 for U.S. resales) and may require prior written consent from the Company" },
      { id: "understands_no_hedging", type: "checkbox", required: true, label: "I agree not to engage in hedging transactions with respect to the Tokens prior to the end of the applicable Regulation S distribution compliance period" },
      { id: "accepts_indemnification", type: "checkbox", required: true, label: "I agree to indemnify the Company against any losses arising from a breach of these representations" },
    ],
  },

  // ── Section F: General Representations ──
  {
    id: "section_f",
    title: "Section F — General Representations",
    subtitle: "Acknowledgment of offering documents and investment experience",
    fields: [
      { id: "has_read_ppm", type: "checkbox", required: true, label: "I have received and read the Private Placement Memorandum (PPM)" },
      { id: "has_read_saft", type: "checkbox", required: true, label: "I have received and read the Simple Agreement for Future Tokens (SAFT)" },
      { id: "has_read_cis", type: "checkbox", required: true, label: "I have received and read the Confidential Information Statement (CIS)" },
      { id: "has_investment_experience", type: "checkbox", required: true, label: "I have sufficient knowledge and experience in financial and business matters to evaluate the merits and risks of this investment" },
      { id: "no_reliance_on_company", type: "checkbox", required: true, label: "I have not relied on any representation or warranty by the Company or its agents other than those contained in the offering documents" },
    ],
  },
];
