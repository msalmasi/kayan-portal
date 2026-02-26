// ============================================================
// Email utility — composes branded Kayan emails
// Uses Resend for delivery. Falls back to logging if no API key.
// Set RESEND_API_KEY and EMAIL_FROM in your .env
// ============================================================

const PORTAL_URL = "https://kayan.panoptes.io";
const LOGO_URL =
  "https://vwhnytgyjfrexekegkql.supabase.co/storage/v1/object/public/assets/kayan-white-logo-01.png";

/** Shared email wrapper — dark header with logo, white body */
function wrapHtml(body: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:480px;margin:0 auto;padding:24px 16px;">
  <div style="background:#1a3c2a;border-radius:12px 12px 0 0;padding:32px 24px;text-align:center;">
    <img src="${LOGO_URL}" alt="Kayan Forest" height="32" style="height:32px;"/>
  </div>
  <div style="background:#ffffff;border-radius:0 0 12px 12px;padding:32px 24px;border:1px solid #e5e7eb;border-top:none;">
    ${body}
  </div>
  <p style="text-align:center;font-size:11px;color:#9ca3af;margin-top:16px;">
    Kayan International Inc. &bull; Confidential
  </p>
</div>
</body></html>`;
}

/** Compose welcome email HTML + subject */
export function composeWelcomeEmail(investorName: string) {
  const subject = "Welcome to the Kayan Token Investor Portal";
  const html = wrapHtml(`
    <h2 style="margin:0 0 8px;font-size:18px;color:#111827;">Welcome, ${investorName}</h2>
    <p style="margin:0 0 16px;font-size:14px;color:#6b7280;line-height:1.6;">
      Your account on the Kayan Token Investor Portal has been created.
      You can now log in to begin the verification process.
    </p>
    <a href="${PORTAL_URL}" style="display:inline-block;background:#1a3c2a;color:#ffffff;padding:12px 32px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">
      Open Investor Portal
    </a>
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
export function composeCapitalCallEmail(
  investorName: string,
  amountUsd: number,
  roundName: string
) {
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amountUsd);

  const subject = `Kayan Token — Capital Call: ${formatted} for ${roundName}`;
  const html = wrapHtml(`
    <h2 style="margin:0 0 8px;font-size:18px;color:#111827;">Capital Call</h2>
    <p style="margin:0 0 16px;font-size:14px;color:#6b7280;line-height:1.6;">
      Dear ${investorName}, your subscription for the <strong>${roundName}</strong>
      round has been approved. Please remit payment to complete your token purchase.
    </p>
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin:0 0 16px;">
      <table style="width:100%;font-size:14px;color:#374151;" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:4px 0;font-weight:600;">Amount Due</td>
          <td style="padding:4px 0;text-align:right;">${formatted}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;font-weight:600;">Round</td>
          <td style="padding:4px 0;text-align:right;">${roundName}</td>
        </tr>
      </table>
    </div>
    <p style="margin:0 0 8px;font-size:14px;color:#374151;font-weight:600;">Accepted Payment Methods</p>
    <ul style="margin:0 0 16px;padding-left:20px;font-size:13px;color:#6b7280;line-height:1.8;">
      <li>USD Wire Transfer</li>
      <li>USDT (Tether) — ERC-20 or TRC-20</li>
      <li>USDC (USD Coin) — ERC-20</li>
      <li>Credit Card</li>
    </ul>
    <p style="margin:0 0 16px;font-size:13px;color:#6b7280;line-height:1.6;">
      Payment instructions and wallet addresses will be provided by your
      account representative. Please include your full name as a reference
      on wire transfers.
    </p>
    <a href="${PORTAL_URL}" style="display:inline-block;background:#1a3c2a;color:#ffffff;padding:12px 32px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">
      View Your Dashboard
    </a>
    <hr style="border:none;border-top:1px solid #f3f4f6;margin:24px 0 16px;"/>
    <p style="margin:0;font-size:11px;color:#9ca3af;">
      This email was sent by the Kayan Token administration team.
      If you believe this was sent in error, please contact your account representative.
    </p>
  `);
  return { subject, html };
}

/** Compose subscription docs package email — sent when KYC is approved */
export function composeDocsPackageEmail(investorName: string) {
  const subject = "Kayan Token — Subscription Documents Ready";
  const html = wrapHtml(`
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
      <li><strong>Company Information Sheet (CIS)</strong> — Kayan project overview</li>
    </ol>
    <p style="margin:0 0 16px;font-size:13px;color:#6b7280;line-height:1.6;">
      Please log in to the portal to complete your <strong>Purchaser Questionnaire</strong>.
      Your SAFT, PPM, and CIS will be provided by your account representative.
    </p>
    <a href="${PORTAL_URL}/pq" style="display:inline-block;background:#1a3c2a;color:#ffffff;padding:12px 32px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">
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
export function composePqSubmittedEmail(investorName: string, investorEmail: string) {
  const subject = `PQ Submitted — ${investorName}`;
  const html = wrapHtml(`
    <h2 style="margin:0 0 8px;font-size:18px;color:#111827;">PQ Submission Received</h2>
    <p style="margin:0 0 16px;font-size:14px;color:#6b7280;line-height:1.6;">
      <strong>${investorName}</strong> (${investorEmail}) has submitted their
      Purchaser Questionnaire and is awaiting review.
    </p>
    <a href="${PORTAL_URL}/admin/investors" style="display:inline-block;background:#1a3c2a;color:#ffffff;padding:12px 32px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">
      Review in Admin Panel
    </a>
  `);
  return { subject, html };
}

/** Compose PQ review result email — sent to investor after admin review */
export function composePqResultEmail(
  investorName: string,
  approved: boolean,
  notes?: string
) {
  const subject = approved
    ? "Kayan Token — Subscription Approved"
    : "Kayan Token — Purchaser Questionnaire Update";
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

  const html = wrapHtml(`
    ${body}
    <a href="${PORTAL_URL}/pq" style="display:inline-block;background:#1a3c2a;color:#ffffff;padding:12px 32px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">
      Open Portal
    </a>
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
  const from = process.env.EMAIL_FROM || "Kayan Forest <noreply@kayanforest.com>";

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
