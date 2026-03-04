// ============================================================
// Document Generator — fills SAFT templates, renders HTML,
// generates signed PDFs with audit trail
// ============================================================

import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import mammoth from "mammoth";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import crypto from "crypto";
import { getEntityConfig } from "@/lib/entity-config";

// ─── SAFT Template Processing ───────────────────────────────

/** Variables extracted from investor + round + PQ data */
export interface SaftVariables {
  investor_name: string;
  investor_email: string;
  investor_address: string;
  investor_jurisdiction: string;
  investment_amount_usd: string;
  token_amount: string;
  token_price: string;
  round_name: string;
  payment_method: string;
  date: string;
  [key: string]: string; // allow extra custom vars
}

/** Human-readable labels for standard placeholders */
export const PLACEHOLDER_LABELS: Record<string, string> = {
  investor_name: "Full Legal Name",
  investor_email: "Email Address",
  investor_address: "Mailing Address",
  investor_jurisdiction: "Jurisdiction of Residence",
  investment_amount_usd: "Investment Amount (USD)",
  token_amount: "Token Amount",
  token_price: "Token Price",
  round_name: "Round Name",
  payment_method: "Payment Method",
  date: "Date",
  // Novation-specific
  old_entity: "Original Issuing Entity",
  new_entity: "New Issuing Entity",
  new_jurisdiction: "New Entity Jurisdiction",
  reason: "Reason for Change",
  original_saft_date: "Original SAFT Date",
};

/** A missing variable entry stored on the document record */
export interface MissingVariable {
  key: string;
  label: string;
}

/**
 * Detect which variables are still empty/blank after auto-fill.
 * Returns array of { key, label } for each missing field.
 */
export function detectMissingVariables(
  variables: SaftVariables,
  templatePlaceholders: string[]
): MissingVariable[] {
  const missing: MissingVariable[] = [];

  for (const key of templatePlaceholders) {
    const value = variables[key];
    // Consider a variable "missing" if it's empty, undefined, or our blank sentinel
    if (!value || value === "" || value === "—" || value === "___") {
      missing.push({
        key,
        label: PLACEHOLDER_LABELS[key] || key.replace(/_/g, " "),
      });
    }
  }

  return missing;
}

/**
 * Fill a .docx template with variables using docxtemplater.
 * Returns the filled docx as a Buffer.
 *
 * Template uses {variable_name} syntax.
 * Missing variables (empty/"—") are rendered as "___" for visual clarity.
 */
export function fillDocxTemplate(
  templateBuffer: Buffer,
  variables: SaftVariables
): Buffer {
  const zip = new PizZip(templateBuffer);
  const doc = new Docxtemplater(zip, {
    // Replace missing tags with blank placeholder
    nullGetter: () => "___",
    paragraphLoop: true,
    linebreaks: true,
  });

  // Replace "—" sentinels with blank so docxtemplater shows "___"
  const cleanVars: Record<string, string> = {};
  for (const [k, v] of Object.entries(variables)) {
    cleanVars[k] = (!v || v === "—" || v === "___") ? "" : v;
  }

  doc.render(cleanVars);

  return Buffer.from(doc.getZip().generate({ type: "nodebuffer" }));
}

/**
 * Extract placeholder keys from a .docx template.
 * Scans for all {{variable_name}} patterns.
 */
export function extractPlaceholders(templateBuffer: Buffer): string[] {
  const zip = new PizZip(templateBuffer);
  const doc = new Docxtemplater(zip, {
    nullGetter: () => "",
    paragraphLoop: true,
    linebreaks: true,
  });

  // docxtemplater exposes getFullText() to inspect content
  const fullText = doc.getFullText();
  const regex = /\{(\w+)\}/g;
  const placeholders = new Set<string>();
  let match;
  while ((match = regex.exec(fullText)) !== null) {
    placeholders.add(match[1]);
  }
  return Array.from(placeholders);
}

/**
 * Convert a filled .docx buffer to clean HTML using mammoth.
 * Returns styled HTML suitable for in-portal document viewing.
 * Blank fields ("___") are highlighted for visibility.
 */
export async function docxToHtml(docxBuffer: Buffer): Promise<string> {
  const result = await mammoth.convertToHtml(
    { buffer: docxBuffer },
    {
      styleMap: [
        "p[style-name='Title'] => h1",
        "p[style-name='Heading 1'] => h2",
        "p[style-name='Heading 2'] => h3",
        "p[style-name='Heading 3'] => h4",
      ],
    }
  );

  // Highlight blank placeholders so investors can see what needs filling
  const highlighted = result.value.replace(
    /___/g,
    '<span class="blank-field">___</span>'
  );

  return wrapDocumentHtml(highlighted);
}

/**
 * Wrap raw HTML content in a professional document layout.
 * Styled to look like a printed legal document.
 */
function wrapDocumentHtml(bodyHtml: string): string {
  return `<div class="legal-document">
  <style>
    .legal-document {
      font-family: 'Times New Roman', Georgia, serif;
      font-size: 14px;
      line-height: 1.7;
      color: #1a1a1a;
      max-width: 720px;
      margin: 0 auto;
      padding: 40px 20px;
    }
    .legal-document h1 {
      font-size: 22px;
      font-weight: 700;
      text-align: center;
      margin: 0 0 24px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .legal-document h2 {
      font-size: 16px;
      font-weight: 700;
      margin: 28px 0 12px;
      text-transform: uppercase;
    }
    .legal-document h3 {
      font-size: 15px;
      font-weight: 700;
      margin: 20px 0 8px;
    }
    .legal-document h4 {
      font-size: 14px;
      font-weight: 700;
      margin: 16px 0 8px;
    }
    .legal-document p {
      margin: 0 0 12px;
      text-align: justify;
    }
    .legal-document table {
      width: 100%;
      border-collapse: collapse;
      margin: 16px 0;
    }
    .legal-document td, .legal-document th {
      border: 1px solid #d1d5db;
      padding: 8px 12px;
      text-align: left;
      font-size: 13px;
    }
    .legal-document th {
      background: #f9fafb;
      font-weight: 600;
    }
    .legal-document ul, .legal-document ol {
      margin: 8px 0 12px 24px;
    }
    .legal-document li {
      margin: 4px 0;
    }
    .legal-document strong {
      font-weight: 700;
    }
    .legal-document em {
      font-style: italic;
    }
    .legal-document .blank-field {
      background: #fef3c7;
      border-bottom: 2px solid #f59e0b;
      padding: 0 4px;
      color: #92400e;
      font-weight: 600;
    }
  </style>
  ${bodyHtml}
</div>`;
}

// ─── Document Hashing ───────────────────────────────────────

/** Generate SHA-256 hash of document content for tamper detection */
export function hashContent(content: string | Buffer): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

// ─── Signed PDF Generation ──────────────────────────────────

/**
 * Signing metadata captured during the signing ceremony.
 */
export interface SigningData {
  signatureName: string;
  signedAt: string;       // ISO timestamp
  ipAddress: string;
  userAgent: string;
  documentHash: string;
  investorName: string;
  investorEmail: string;
  documentTitle: string;
  roundName: string;
  offshoreConfirmed: boolean;
  consentConfirmed: boolean;
}

/**
 * Generate a Certificate of Execution PDF.
 *
 * This is a professional document that attests to the electronic
 * signing of the SAFT agreement — equivalent to what DocuSign
 * generates as the "Certificate of Completion".
 *
 * Contains: document reference, signer details, signature,
 * timestamp, IP, document hash, and legal attestation.
 */
export async function generateSignedPdf(
  signing: SigningData
): Promise<Uint8Array> {
  const entityConfig = await getEntityConfig();
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]); // US Letter
  const font = await pdf.embedFont(StandardFonts.TimesRoman);
  const bold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const mono = await pdf.embedFont(StandardFonts.Courier);

  const dark = rgb(0.1, 0.1, 0.1);
  const gray = rgb(0.4, 0.4, 0.4);

  // Brand color from entity config (hex to rgb)
  const hex = entityConfig.brand_primary;
  const brandColor = rgb(
    parseInt(hex.slice(0, 2), 16) / 255,
    parseInt(hex.slice(2, 4), 16) / 255,
    parseInt(hex.slice(4, 6), 16) / 255
  );

  let y = 720;

  // ── Header ──
  page.drawText("CERTIFICATE OF EXECUTION", {
    x: 140, y, size: 18, font: bold, color: brandColor,
  });
  y -= 12;
  page.drawLine({
    start: { x: 50, y }, end: { x: 562, y },
    thickness: 2, color: brandColor,
  });
  y -= 30;

  page.drawText(entityConfig.entity_name, {
    x: 50, y, size: 12, font: bold, color: dark,
  });
  y -= 16;
  page.drawText("Simple Agreement for Future Tokens (SAFT)", {
    x: 50, y, size: 11, font, color: gray,
  });
  y -= 30;

  // ── Document Details ──
  const drawField = (label: string, value: string) => {
    page.drawText(label, { x: 50, y, size: 10, font: bold, color: dark });
    page.drawText(value, { x: 200, y, size: 10, font, color: dark });
    y -= 18;
  };

  drawField("Document:", signing.documentTitle);
  drawField("Round:", signing.roundName);
  drawField("Signer:", signing.investorName);
  drawField("Email:", signing.investorEmail);
  y -= 10;

  // ── Divider ──
  page.drawLine({
    start: { x: 50, y }, end: { x: 562, y },
    thickness: 0.5, color: rgb(0.8, 0.8, 0.8),
  });
  y -= 24;

  // ── Signing Details ──
  page.drawText("ELECTRONIC SIGNATURE", {
    x: 50, y, size: 12, font: bold, color: brandColor,
  });
  y -= 24;

  drawField("Signature:", signing.signatureName);
  drawField("Date & Time:", new Date(signing.signedAt).toUTCString());
  drawField("IP Address:", signing.ipAddress);
  y -= 10;

  // ── Security Details ──
  page.drawText("DOCUMENT INTEGRITY", {
    x: 50, y, size: 12, font: bold, color: brandColor,
  });
  y -= 24;

  page.drawText("SHA-256 Hash:", {
    x: 50, y, size: 10, font: bold, color: dark,
  });
  y -= 16;
  page.drawText(signing.documentHash, {
    x: 50, y, size: 8, font: mono, color: gray,
  });
  y -= 24;

  page.drawText("User Agent:", {
    x: 50, y, size: 10, font: bold, color: dark,
  });
  y -= 16;

  // Truncate long user agents
  const ua = signing.userAgent.length > 90
    ? signing.userAgent.substring(0, 90) + "..."
    : signing.userAgent;
  page.drawText(ua, {
    x: 50, y, size: 7, font: mono, color: gray,
  });
  y -= 30;

  // ── Divider ──
  page.drawLine({
    start: { x: 50, y }, end: { x: 562, y },
    thickness: 0.5, color: rgb(0.8, 0.8, 0.8),
  });
  y -= 24;

  // ── Certifications ──
  page.drawText("CERTIFICATIONS", {
    x: 50, y, size: 12, font: bold, color: brandColor,
  });
  y -= 20;

  const checkMark = signing.offshoreConfirmed ? "■" : "□";
  const consentMark = signing.consentConfirmed ? "■" : "□";

  const certLines = [
    `${checkMark}  Offshore Certification: The signer certified that they were physically`,
    `    located outside of the United States at the time of execution and that this`,
    `    transaction was not conducted on behalf of any U.S. Person under Regulation S.`,
    "",
    `${consentMark}  E-Signature Consent: The signer consented to execute this agreement`,
    `    electronically with full understanding that the electronic signature carries the`,
    `    same legal force as a handwritten signature under the ESIGN Act, UETA, and`,
    `    equivalent international regulations.`,
  ];

  for (const line of certLines) {
    if (line === "") { y -= 6; continue; }
    page.drawText(line, { x: 50, y, size: 9, font, color: dark });
    y -= 13;
  }
  y -= 10;

  // ── Divider ──
  page.drawLine({
    start: { x: 50, y }, end: { x: 562, y },
    thickness: 0.5, color: rgb(0.8, 0.8, 0.8),
  });
  y -= 24;

  // ── Legal attestation ──
  page.drawText("ATTESTATION", {
    x: 50, y, size: 12, font: bold, color: brandColor,
  });
  y -= 20;

  const attestation = [
    "This Certificate of Execution confirms that the above-named individual",
    `electronically signed the referenced agreement through the ${entityConfig.project_name}`,
    "Investor Portal. The signer explicitly consented to electronic execution and",
    "certified their physical location outside the United States at the time of",
    "signing. The signature was captured with the timestamp, IP address, and",
    "user agent recorded above. The document hash confirms the exact version of",
    "the document that was presented to and signed by the signer. This electronic",
    "signature is intended to have the same legal force and effect as a handwritten",
    "signature pursuant to the U.S. ESIGN Act, UETA, and applicable international",
    "electronic signature laws.",
  ];

  for (const line of attestation) {
    page.drawText(line, { x: 50, y, size: 10, font, color: dark });
    y -= 15;
  }

  y -= 20;

  // ── Footer ──
  page.drawLine({
    start: { x: 50, y }, end: { x: 562, y },
    thickness: 1, color: brandColor,
  });
  y -= 16;
  page.drawText(
    `Generated by ${entityConfig.project_name} Investor Portal • Confidential`,
    { x: 150, y, size: 8, font, color: gray }
  );

  return pdf.save();
}
