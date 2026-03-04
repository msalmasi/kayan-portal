// ============================================================
// Email utility — white-label branded emails
// Uses Resend for delivery. Falls back to logging if no API key.
// All branding comes from EntityConfig (lib/entity-config.ts).
// ============================================================

import { getEntityConfig, EntityConfig } from "@/lib/entity-config";

/** Branding bundle used internally by compose functions */
interface EmailBranding {
  portalUrl: string;
  logoUrl: string;
  color: string;    // hex without #
  footer: string;
  projectName: string;
  fromLine: string;  // "Name <email>"
}

/** Fetch entity config and extract email branding fields */
async function getBranding(): Promise<EmailBranding> {
  const c = await getEntityConfig();
  return {
    portalUrl: c.portal_url,
    logoUrl: c.logo_light_url,
    color: c.brand_primary,
    footer: c.footer_text,
    projectName: c.project_name,
    fromLine: `${c.email_from_name} <${c.email_from_address}>`,
  };
}

/** Shared email wrapper — dark header with logo, white body */
function wrapHtml(b: EmailBranding, body: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:480px;margin:0 auto;padding:24px 16px;">
  <div style="background:#${b.color};border-radius:12px 12px 0 0;padding:32px 24px;text-align:center;">
    <img src="${b.logoUrl}" alt="${b.projectName}" height="32" style="height:32px;"/>
  </div>
  <div style="background:#ffffff;border-radius:0 0 12px 12px;padding:32px 24px;border:1px solid #e5e7eb;border-top:none;">
    ${body}
  </div>
  <p style="text-align:center;font-size:11px;color:#9ca3af;margin-top:16px;">
    ${b.footer}
  </p>
</div>
</body></html>`;
}

/** CTA button helper */
function btn(b: EmailBranding, href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:#${b.color};color:#ffffff;padding:12px 32px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">${label}</a>`;
}

/** Compose welcome email HTML + subject */
export async function composeWelcomeEmail(investorName: string) {
  const b = await getBranding();
  const subject = `Welcome to the ${b.projectName} Investor Portal`;
  const html = wrapHtml(b, `
    <h2 style="margin:0 0 8px;font-size:18px;color:#111827;">Welcome, ${investorName}</h2>
    <p style="margin:0 0 16px;font-size:14px;color:#6b7280;line-height:1.6;">
      Your account on the ${b.projectName} Investor Portal has been created.
      You can now log in to begin the verification process.
    </p>
    ${btn(b, `${b.portalUrl}`, "Open Investor Portal")}
    <p style="margin:16px 0 0;font-size:13px;color:#6b7280;line-height:1.6;">
      <strong>How to log in:</strong> Enter the email address associated with your
      account and click the magic link we send you. No password needed.
    </p>
    <p style="margin:12px 0 0;font-size:13px;color:#6b7280;line-height:1.6;">
      <strong>First time?</strong> You may receive a "Confirm your email" message.
      Clicking it will confirm your account and sign you in automatically.
    </p>
    <hr style="border:none;border-top:1px solid #f3f4f6;margin:24px 0 16px;"/>
    <p style="margin:0;font-size:11px;color:#9ca3af;">
      If you did not expect this email, please disregard it.
    </p>
  `);
  return { subject, html };
}

/** Compose capital call email HTML + subject */
export async function composeCapitalCallEmail(
  investorName: string,
  amountUsd: number,
  roundName: string,
  /** Pass enabled method IDs, e.g. ["usdc_eth","usdc_sol","wire"]. Defaults to all crypto if omitted. */
  enabledMethods?: string[],
  /** Payment deadline date for this capital call */
  paymentDeadline?: string | null
) {
  const b = await getBranding();
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amountUsd);

  // Build payment method rows based on what's enabled
  const methods = enabledMethods ?? ["usdc_eth", "usdc_sol", "usdt_eth"];
  const hasCrypto = methods.some(m => m.startsWith("usdc_") || m.startsWith("usdt_"));
  const hasWire = methods.includes("wire");

  const cryptoLabels: string[] = [];
  if (methods.includes("usdc_eth")) cryptoLabels.push("USDC on Ethereum");
  if (methods.includes("usdc_sol")) cryptoLabels.push("USDC on Solana");
  if (methods.includes("usdt_eth")) cryptoLabels.push("USDT on Ethereum");

  let methodRows = "";

  if (hasCrypto) {
    methodRows += `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;vertical-align:top;">
          <strong style="color:#374151;">Crypto${!hasWire ? "" : " (Recommended)"}</strong>
        </td>
        <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;">
          ${cryptoLabels.join(", ")}.<br/>
          <span style="color:#059669;font-size:11px;">✓ Automatic on-chain verification — instant confirmation</span>
        </td>
      </tr>`;
  }

  if (hasWire) {
    methodRows += `
      <tr>
        <td style="padding:8px 0;${hasCrypto ? "" : "border-bottom:1px solid #f3f4f6;"}vertical-align:top;">
          <strong style="color:#374151;">Wire Transfer (USD)</strong>
        </td>
        <td style="padding:8px 0;${hasCrypto ? "" : "border-bottom:1px solid #f3f4f6;"}">
          Bank wire instructions available in the portal.<br/>
          <span style="font-size:11px;color:#9ca3af;">Manual verification — 2–5 business days</span>
        </td>
      </tr>`;
  }

  const subject = `${b.projectName} — Capital Call: ${formatted} for ${roundName}`;
  const html = wrapHtml(b, `
    <h2 style="margin:0 0 8px;font-size:18px;color:#111827;">Capital Call</h2>
    <p style="margin:0 0 16px;font-size:14px;color:#6b7280;line-height:1.6;">
      Dear ${investorName}, your subscription for the <strong>${roundName}</strong>
      round has been approved. Please remit payment to complete your token purchase.
    </p>
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin:0 0 16px;">
      <table style="width:100%;font-size:14px;color:#374151;" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:4px 0;font-weight:600;">Amount Due</td>
          <td style="padding:4px 0;text-align:right;font-size:20px;font-weight:700;color:#111827;">${formatted}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;font-weight:600;">Round</td>
          <td style="padding:4px 0;text-align:right;">${roundName}</td>
        </tr>${paymentDeadline ? `
        <tr>
          <td style="padding:4px 0;font-weight:600;">Payment Deadline</td>
          <td style="padding:4px 0;text-align:right;color:#dc2626;font-weight:600;">${new Date(paymentDeadline).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</td>
        </tr>` : ""}
      </table>
    </div>

    <p style="margin:0 0 8px;font-size:14px;color:#374151;font-weight:600;">Payment Methods</p>
    <table style="width:100%;font-size:13px;color:#6b7280;border-collapse:collapse;margin:0 0 16px;" cellpadding="0" cellspacing="0">
      ${methodRows}
    </table>

    <p style="margin:0 0 16px;font-size:13px;color:#6b7280;line-height:1.6;">
      Log in to your investor portal to select a payment method, view transfer
      details, and submit your payment. Crypto payments are verified automatically
      on-chain within minutes.
    </p>
    <a href="${b.portalUrl}/dashboard#payments" style="display:inline-block;background:#${b.color};color:#ffffff;padding:12px 32px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">
      Make Payment →
    </a>
    <hr style="border:none;border-top:1px solid #f3f4f6;margin:24px 0 16px;"/>
    <p style="margin:0;font-size:11px;color:#9ca3af;">
      This email was sent by the ${b.projectName} administration team.
      If you believe this was sent in error, please contact your account representative.
    </p>
  `);
  return { subject, html };
}

/** Compose subscription docs package email — sent when KYC is approved */
export async function composeDocsPackageEmail(investorName: string) {
  const b = await getBranding();
  const subject = `${b.projectName} — Subscription Documents Ready`;
  const html = wrapHtml(b, `
    <h2 style="margin:0 0 8px;font-size:18px;color:#111827;">Subscription Documents</h2>
    <p style="margin:0 0 16px;font-size:14px;color:#6b7280;line-height:1.6;">
      Dear ${investorName}, congratulations — your identity verification is complete.
      You can now review and complete your subscription documents.
    </p>
    <p style="margin:0 0 8px;font-size:14px;color:#374151;font-weight:600;">Documents to Complete</p>
    <ol style="margin:0 0 16px;padding-left:20px;font-size:13px;color:#6b7280;line-height:1.8;">
      <li><strong>SAFT Agreement</strong> — your token purchase contract</li>
      <li><strong>Purchaser Questionnaire (PQ)</strong> — complete directly in the portal</li>
      <li><strong>Private Placement Memorandum (PPM)</strong> — offering details</li>
      <li><strong>Confidential Information Statement (CIS)</strong> — ${b.projectName} project overview</li>
    </ol>
    <p style="margin:0 0 16px;font-size:13px;color:#6b7280;line-height:1.6;">
      Please log in to the portal to complete your <strong>Purchaser Questionnaire</strong>.
      Your SAFT, PPM, and CIS will be provided by your account representative.
    </p>
    <a href="${b.portalUrl}/pq" style="display:inline-block;background:#${b.color};color:#ffffff;padding:12px 32px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">
      Complete Purchaser Questionnaire
    </a>
    <hr style="border:none;border-top:1px solid #f3f4f6;margin:24px 0 16px;"/>
    <p style="margin:0;font-size:11px;color:#9ca3af;">
      All documents are confidential. Do not forward this email to third parties.
    </p>
  `);
  return { subject, html };
}

/** Compose PQ submission notification — sent to admin when investor submits PQ */
export async function composePqSubmittedEmail(investorName: string, investorEmail: string) {
  const b = await getBranding();
  const subject = `PQ Submitted — ${investorName}`;
  const html = wrapHtml(b, `
    <h2 style="margin:0 0 8px;font-size:18px;color:#111827;">PQ Submission Received</h2>
    <p style="margin:0 0 16px;font-size:14px;color:#6b7280;line-height:1.6;">
      <strong>${investorName}</strong> (${investorEmail}) has submitted their
      Purchaser Questionnaire and is awaiting review.
    </p>
    <a href="${b.portalUrl}/admin/investors" style="display:inline-block;background:#${b.color};color:#ffffff;padding:12px 32px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">
      Review in Admin Panel
    </a>
  `);
  return { subject, html };
}

/** Compose PQ review result email — sent to investor after admin review */
export async function composePqResultEmail(
  investorName: string,
  approved: boolean,
  notes?: string
) {
  const b = await getBranding();
  const subject = approved
    ? "${b.projectName} — Subscription Approved"
    : "${b.projectName} — Purchaser Questionnaire Update";
  const body = approved
    ? `<h2 style="margin:0 0 8px;font-size:18px;color:#111827;">Subscription Approved</h2>
       <p style="margin:0 0 16px;font-size:14px;color:#6b7280;line-height:1.6;">
         Dear ${investorName}, your Purchaser Questionnaire has been reviewed and approved.
         You will receive a capital call notice shortly with payment instructions.
       </p>`
    : `<h2 style="margin:0 0 8px;font-size:18px;color:#111827;">Action Required</h2>
       <p style="margin:0 0 16px;font-size:14px;color:#6b7280;line-height:1.6;">
         Dear ${investorName}, we need additional information regarding your
         Purchaser Questionnaire. Please log in to the portal to review and update.
       </p>
       ${notes ? `<div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:12px;margin:0 0 16px;font-size:13px;color:#92400e;">${notes}</div>` : ""}`;

  const html = wrapHtml(b, `
    ${body}
    <a href="${b.portalUrl}/pq" style="display:inline-block;background:#${b.color};color:#ffffff;padding:12px 32px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">
      Open Portal
    </a>
  `);
  return { subject, html };
}

/** Compose "PQ update prompt" email — sent when a new allocation is added to an investor with an approved PQ */
export async function composePqUpdatePromptEmail(
  investorName: string,
  roundName: string,
  tokenAmount?: number
) {
  const b = await getBranding();
  const subject = `${b.projectName} — Please Review Your Purchaser Questionnaire`;
  const tokenLine = tokenAmount
    ? ` for <strong>${Number(tokenAmount).toLocaleString()} tokens</strong>`
    : "";
  const html = wrapHtml(b, `
    <h2 style="margin:0 0 8px;font-size:18px;color:#111827;">New Allocation Added</h2>
    <p style="margin:0 0 16px;font-size:14px;color:#6b7280;line-height:1.6;">
      Dear ${investorName}, a new allocation has been added to your account
      in the <strong>${roundName}</strong> round${tokenLine}.
    </p>
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:16px;margin:0 0 16px;">
      <p style="margin:0;font-size:14px;color:#92400e;line-height:1.5;">
        <strong>Action requested:</strong> Please review and update your Purchaser Questionnaire
        to reflect this new allocation. Your updated questionnaire will need to be re-approved
        by our compliance team.
      </p>
    </div>
    <p style="margin:0 0 16px;font-size:13px;color:#6b7280;line-height:1.6;">
      If your investment details (amount, payment method, source of funds) have not changed,
      you may re-submit the questionnaire as-is for re-approval.
    </p>
    <a href="${b.portalUrl}/pq" style="display:inline-block;background:#${b.color};color:#ffffff;padding:12px 32px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">
      Update Questionnaire →
    </a>
    <hr style="border:none;border-top:1px solid #f3f4f6;margin:24px 0 16px;"/>
    <p style="margin:0;font-size:11px;color:#9ca3af;">
      This email was sent by the ${b.projectName} administration team.
    </p>
  `);
  return { subject, html };
}

/** Compose "documents ready" email — sent when SAFT is generated and ready to sign */
export async function composeDocumentsReadyEmail(investorName: string, roundName: string) {
  const b = await getBranding();
  const subject = `${b.projectName} — ${roundName} Documents Ready for Signing`;
  const html = wrapHtml(b, `
    <h2 style="margin:0 0 8px;font-size:18px;color:#111827;">Documents Ready</h2>
    <p style="margin:0 0 16px;font-size:14px;color:#6b7280;line-height:1.6;">
      Dear ${investorName}, your subscription documents for the <strong>${roundName}</strong>
      round are ready. Please log in to review and sign your SAFT Agreement.
    </p>
    <p style="margin:0 0 8px;font-size:14px;color:#374151;font-weight:600;">Your document set includes:</p>
    <ol style="margin:0 0 16px;padding-left:20px;font-size:13px;color:#6b7280;line-height:1.8;">
      <li><strong>SAFT Agreement</strong> — review and sign electronically</li>
      <li><strong>Private Placement Memorandum (PPM)</strong> — for your reference</li>
      <li><strong>Confidential Information Statement (CIS)</strong> — for your reference</li>
    </ol>
    <a href="${b.portalUrl}/documents" style="display:inline-block;background:#${b.color};color:#ffffff;padding:12px 32px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">
      Review & Sign Documents
    </a>
    <hr style="border:none;border-top:1px solid #f3f4f6;margin:24px 0 16px;"/>
    <p style="margin:0;font-size:11px;color:#9ca3af;">
      All documents are confidential. Do not forward this email to third parties.
    </p>
  `);
  return { subject, html };
}

/**
 * Compose allocation confirmed email — sent when:
 *   - Admin marks payment as "paid" (includes wire ref / tx hash)
 *   - Grant allocations are auto-confirmed (no payment required)
 */
export async function composeAllocationConfirmedEmail(
  investorName: string,
  tokenAmount: number,
  roundName: string,
  opts?: {
    isGrant?: boolean;
    txReference?: string;
    paymentMethod?: string;
    amountUsd?: number;
  }
) {
  const b = await getBranding();
  const isGrant = opts?.isGrant || false;
  const formattedTokens = tokenAmount.toLocaleString();

  const subject = isGrant
    ? `${b.projectName} — Your ${roundName} Token Grant is Confirmed`
    : `${b.projectName} — Payment Confirmed for ${roundName}`;

  // Payment details row (only for non-grant)
  const paymentDetails = !isGrant
    ? `
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin:0 0 16px;">
        <table style="width:100%;font-size:14px;color:#374151;" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:4px 0;font-weight:600;">Round</td>
            <td style="padding:4px 0;">${roundName}</td>
          </tr>
          <tr>
            <td style="padding:4px 0;font-weight:600;">Tokens</td>
            <td style="padding:4px 0;">${formattedTokens} $KAYAN</td>
          </tr>
          ${opts?.amountUsd ? `<tr>
            <td style="padding:4px 0;font-weight:600;">Amount</td>
            <td style="padding:4px 0;">$${opts.amountUsd.toLocaleString()}</td>
          </tr>` : ""}
          ${opts?.paymentMethod ? `<tr>
            <td style="padding:4px 0;font-weight:600;">Method</td>
            <td style="padding:4px 0;">${opts.paymentMethod}</td>
          </tr>` : ""}
          ${opts?.txReference ? `<tr>
            <td style="padding:4px 0;font-weight:600;">Reference</td>
            <td style="padding:4px 0;font-family:monospace;font-size:13px;">${opts.txReference}</td>
          </tr>` : ""}
        </table>
      </div>`
    : `
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:20px;margin:0 0 16px;">
        <table style="width:100%;font-size:14px;color:#374151;" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:4px 0;font-weight:600;">Round</td>
            <td style="padding:4px 0;">${roundName}</td>
          </tr>
          <tr>
            <td style="padding:4px 0;font-weight:600;">Tokens</td>
            <td style="padding:4px 0;">${formattedTokens} $KAYAN</td>
          </tr>
          <tr>
            <td style="padding:4px 0;font-weight:600;">Type</td>
            <td style="padding:4px 0;">Grant — no payment required</td>
          </tr>
        </table>
      </div>`;

  const html = wrapHtml(b, `
    <h2 style="margin:0 0 8px;font-size:18px;color:#111827;">
      ${isGrant ? "Token Grant Confirmed" : "Payment Confirmed"}
    </h2>
    <p style="margin:0 0 16px;font-size:14px;color:#6b7280;line-height:1.6;">
      Dear ${investorName}, ${isGrant
        ? `your <strong>${formattedTokens} $KAYAN</strong> token grant for the <strong>${roundName}</strong> round has been confirmed.`
        : `we have received and confirmed your payment for the <strong>${roundName}</strong> round. Your token allocation is now secured.`
      }
    </p>
    ${paymentDetails}
    <a href="${b.portalUrl}/dashboard" style="display:inline-block;background:#${b.color};color:#ffffff;padding:12px 32px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">
      View Your Dashboard
    </a>
    <hr style="border:none;border-top:1px solid #f3f4f6;margin:24px 0 16px;"/>
    <p style="margin:0;font-size:11px;color:#9ca3af;">
      Your tokens will be distributed according to the vesting schedule in your SAFT agreement.
    </p>
  `);

  return { subject, html };
}

/** Send email via Resend. Returns true if sent, false if no API key. */
export async function sendEmail(
  to: string,
  subject: string,
  html: string
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const branding = await getBranding();
  const from = process.env.EMAIL_FROM || branding.fromLine;

  if (!apiKey) {
    // No API key — log to console for development
    console.log(`[EMAIL] Would send to: ${to}`);
    console.log(`[EMAIL] Subject: ${subject}`);
    return false;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ from, to, subject, html }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`[EMAIL] Failed to send to ${to}: ${err}`);
    return false;
  }

  return true;
}

// ─── Admin Alert Email ──────────────────────────────────────

/** Event type → human-readable labels for email subject lines */
const EVENT_LABELS: Record<string, string> = {
  kyc_verified: "KYC Verified",
  kyc_rejected: "KYC Rejected",
  pq_submitted: "PQ Submitted",
  saft_signed: "SAFT Signed",
  payment_received: "Payment Received",
  allocation_proposed: "Allocation Proposed",
  allocation_approved: "Allocation Approved",
  allocation_rejected: "Allocation Rejected",
};

/** Priority → colored badge for the email */
const PRIORITY_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  action_required: { bg: "#fef3c7", color: "#92400e", label: "Action Required" },
  info: { bg: "#eff6ff", color: "#1e40af", label: "Info" },
};

/**
 * Compose a branded admin alert email for any notification event.
 * Used by the notify() system to email subscribed admins.
 */
export async function composeAdminAlertEmail(params: {
  eventType: string;
  priority: string;
  investorName: string;
  investorEmail: string;
  title: string;
  detail?: string;
}) {
  const b = await getBranding();
  const label = EVENT_LABELS[params.eventType] || params.eventType;
  const badge = PRIORITY_BADGE[params.priority] || PRIORITY_BADGE.info;

  const subject = `[${b.projectName}] ${label}: ${params.investorName}`;
  const html = wrapHtml(b, `
    <div style="margin-bottom:16px;">
      <span style="display:inline-block;background:${badge.bg};color:${badge.color};padding:4px 10px;border-radius:4px;font-size:11px;font-weight:600;text-transform:uppercase;">
        ${badge.label}
      </span>
    </div>
    <h2 style="margin:0 0 8px;font-size:18px;color:#111827;">${params.title}</h2>
    ${params.detail ? `<p style="margin:0 0 16px;font-size:14px;color:#6b7280;line-height:1.6;">${params.detail}</p>` : ""}
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:0 0 16px;">
      <table style="width:100%;font-size:13px;color:#374151;" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:4px 0;font-weight:600;width:90px;">Investor</td>
          <td style="padding:4px 0;">${params.investorName}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;font-weight:600;">Email</td>
          <td style="padding:4px 0;">${params.investorEmail}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;font-weight:600;">Event</td>
          <td style="padding:4px 0;">${label}</td>
        </tr>
      </table>
    </div>
    <a href="${b.portalUrl}/admin/notifications" style="display:inline-block;background:#${b.color};color:#ffffff;padding:12px 32px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">
      View in Portal
    </a>
    <hr style="border:none;border-top:1px solid #f3f4f6;margin:24px 0 16px;"/>
    <p style="margin:0;font-size:11px;color:#9ca3af;">
      You're receiving this because you subscribed to ${label} alerts.
      <a href="${b.portalUrl}/admin/settings" style="color:#9ca3af;">Manage preferences</a>
    </p>
  `);

  return { subject, html };
}

// ─── REISSUANCE EMAILS ──────────────────────────────────────

/** Notify investor that their SAFT entity is changing and novation is required */
export async function composeNovationEmail(
  investorName: string,
  roundName: string,
  oldEntity: string,
  newEntity: string,
  reason: string
) {
  const b = await getBranding();
  const subject = `Action Required: SAFT Agreement Update — ${roundName}`;
  const html = wrapHtml(b, `
    <h2 style="margin:0 0 16px;font-size:20px;color:#111;">SAFT Agreement Update</h2>
    <p>Dear ${investorName},</p>
    <p>We are writing to inform you of an important change to your SAFT Agreement for the
    <strong>${roundName}</strong> round of the ${b.projectName} offering.</p>
    <p>The issuing entity is being changed from <strong>${oldEntity}</strong> to
    <strong>${newEntity}</strong>. ${reason ? `Reason: ${reason}` : ""}</p>
    <p>To proceed, you will need to:</p>
    <div style="background:#f9fafb;border-radius:8px;padding:16px;margin:16px 0;">
      <p style="margin:0 0 8px;"><strong>Step 1:</strong> Sign a Termination &amp; Novation Agreement
      (confirms you agree to the entity change and terminates the old SAFT)</p>
      <p style="margin:0;"><strong>Step 2:</strong> Sign a new SAFT Agreement with the updated entity
      (will be generated automatically after Step 1)</p>
    </div>
    <p>Your investment terms — token amount, price, and vesting schedule — remain unchanged.
    Only the counterparty entity is being updated.</p>
    <a href="${b.portalUrl}/documents" style="display:inline-block;background:#${b.color};color:#ffffff;padding:12px 32px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;margin:8px 0;">
      Review &amp; Sign
    </a>
    <p style="font-size:12px;color:#6b7280;margin-top:16px;">
      Please note: payments for this round are temporarily paused until you complete both signing steps.
    </p>
  `);
  return { subject, html };
}

/** Notify investor that their replacement SAFT is ready to sign */
export async function composeNewSaftReadyEmail(
  investorName: string,
  roundName: string
) {
  const b = await getBranding();
  const subject = `Your New SAFT Agreement Is Ready — ${roundName}`;
  const html = wrapHtml(b, `
    <h2 style="margin:0 0 16px;font-size:20px;color:#111;">New SAFT Agreement Ready</h2>
    <p>Dear ${investorName},</p>
    <p>Thank you for signing the Termination &amp; Novation Agreement. Your replacement
    SAFT Agreement for the <strong>${roundName}</strong> round has been generated and is
    ready for your review and signature.</p>
    <p>Once signed, your payment obligations will resume and any previously issued
    capital calls will be reactivated.</p>
    <a href="${b.portalUrl}/documents" style="display:inline-block;background:#${b.color};color:#ffffff;padding:12px 32px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;margin:8px 0;">
      Sign New SAFT
    </a>
  `);
  return { subject, html };
}

// ─── Reminder Emails ─────────────────────────────────────────

/**
 * Compose a round-closing reminder when an investor has
 * pending actions (unsigned docs, incomplete KYC/PQ).
 */
export async function composeRoundClosingReminderEmail(
  investorName: string,
  roundName: string,
  closingDate: string,
  daysLeft: number,
  pendingActions: string[]
) {
  const b = await getBranding();
  const formattedDate = new Date(closingDate).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });

  const urgency = daysLeft <= 1
    ? `<span style="color:#dc2626;font-weight:700;">Tomorrow</span>`
    : `<strong>${daysLeft} days</strong> (${formattedDate})`;

  const actionList = pendingActions
    .map((a) => `<li style="padding:4px 0;">${a}</li>`)
    .join("");

  const subject = `${b.projectName} — ${daysLeft <= 1 ? "FINAL DAY" : `${daysLeft} days left`}: ${roundName} round closing`;
  const html = wrapHtml(b, `
    <h2 style="margin:0 0 8px;font-size:18px;color:#111827;">Round Closing Reminder</h2>
    <p style="margin:0 0 16px;font-size:14px;color:#6b7280;line-height:1.6;">
      Dear ${investorName}, the <strong>${roundName}</strong> round closes in ${urgency}.
      You have outstanding items that need to be completed before the deadline.
    </p>
    <div style="background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:16px;margin:0 0 16px;">
      <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#92400e;">Pending actions:</p>
      <ul style="margin:0;padding:0 0 0 20px;font-size:13px;color:#92400e;line-height:1.8;">
        ${actionList}
      </ul>
    </div>
    ${btn(b, b.portalUrl, "Go to Portal")}
    <hr style="border:none;border-top:1px solid #f3f4f6;margin:24px 0 16px;"/>
    <p style="margin:0;font-size:11px;color:#9ca3af;">
      After the closing date, new subscriptions and document signing will no longer be available for this round.
    </p>
  `);
  return { subject, html };
}

/**
 * Compose a payment deadline reminder for an unpaid
 * or partially-paid capital call.
 */
export async function composePaymentReminderEmail(
  investorName: string,
  roundName: string,
  balanceDue: number,
  deadline: string,
  daysLeft: number,
  isPartial: boolean
) {
  const b = await getBranding();
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: 0,
  }).format(balanceDue);

  const formattedDate = new Date(deadline).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });

  const urgency = daysLeft <= 1
    ? `<span style="color:#dc2626;font-weight:700;">Tomorrow</span>`
    : `<strong>${daysLeft} days</strong> (${formattedDate})`;

  const subject = `${b.projectName} — Payment ${daysLeft <= 1 ? "due tomorrow" : `due in ${daysLeft} days`}: ${formatted} for ${roundName}`;
  const html = wrapHtml(b, `
    <h2 style="margin:0 0 8px;font-size:18px;color:#111827;">Payment Reminder</h2>
    <p style="margin:0 0 16px;font-size:14px;color:#6b7280;line-height:1.6;">
      Dear ${investorName}, ${isPartial
        ? "a partial payment was received but your balance is not yet settled."
        : "your capital call payment has not yet been received."
      } The deadline is in ${urgency}.
    </p>
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin:0 0 16px;">
      <table style="width:100%;font-size:14px;color:#374151;" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:4px 0;font-weight:600;">Balance Due</td>
          <td style="padding:4px 0;text-align:right;font-size:20px;font-weight:700;color:#111827;">${formatted}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;font-weight:600;">Round</td>
          <td style="padding:4px 0;text-align:right;">${roundName}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;font-weight:600;">Deadline</td>
          <td style="padding:4px 0;text-align:right;color:#dc2626;font-weight:600;">${formattedDate}</td>
        </tr>
      </table>
    </div>
    ${btn(b, `${b.portalUrl}/dashboard#payments`, "Make Payment →")}
    <hr style="border:none;border-top:1px solid #f3f4f6;margin:24px 0 16px;"/>
    <p style="margin:0;font-size:11px;color:#9ca3af;">
      After the deadline, unpaid allocations may be forfeited. Contact ${b.projectName} support if you need assistance.
    </p>
  `);
  return { subject, html };
}

/**
 * PQ Resubmit Notification — sent when admin forces resubmission.
 */
export async function composePqResubmitEmail(
  investorName: string,
  adminMessage?: string
) {
  const b = await getBranding();
  const subject = `Action Required: Please Resubmit Your Purchaser Questionnaire — ${b.projectName}`;
  const html = wrapHtml(b, `
    <h2 style="color: #111827; margin-bottom: 8px;">Questionnaire Update Required</h2>
    <p style="color: #4b5563;">Dear ${investorName},</p>
    <p style="color: #4b5563;">
      The Purchaser Questionnaire has been updated and your previous submission is no longer current.
      Please log in to the investor portal and resubmit your questionnaire at your earliest convenience.
    </p>
    ${adminMessage ? `
    <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 12px 16px; margin: 16px 0;">
      <p style="color: #92400e; font-size: 14px; margin: 0;"><strong>Note from admin:</strong> ${adminMessage}</p>
    </div>
    ` : ""}
    <div style="text-align: center; margin: 24px 0;">
      <a href="${b.portalUrl}/pq" style="display: inline-block; background: #${b.brandPrimary}; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600;">
        Open Questionnaire
      </a>
    </div>
    <p style="color: #6b7280; font-size: 13px;">
      Your previous answers have been preserved and will be pre-filled for your convenience.
      Please review all sections and confirm your responses before resubmitting.
    </p>
  `);
  return { subject, html };
}
