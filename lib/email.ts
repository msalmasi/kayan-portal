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
