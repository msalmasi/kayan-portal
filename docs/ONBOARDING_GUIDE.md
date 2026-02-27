# Kayan Token Investor Portal — Admin Onboarding Guide

## Overview

The Kayan Portal manages the full lifecycle of token investors — from initial registration through KYC verification, document signing, and payment confirmation. Most steps are automated; this guide explains what happens automatically, what requires manual action, and how to handle edge cases.

---

## The Investor Pipeline

Every investor moves through nine stages. The portal tracks progress automatically and shows a visual stepper on each investor's detail page.

```
1. Investor Added        — Staff creates investor record
2. Allocation Assigned   — Staff assigns tokens to a round
3. KYC Verified          — Sumsub processes identity check
4. Documents Sent        — SAFT + PPM + CIS auto-generated
5. PQ Submitted          — Investor fills Purchaser Questionnaire
6. SAFT Signed           — Investor signs electronically in-portal
7. PQ Approved           — Admin reviews and approves PQ
8. Capital Call Sent      — Payment request auto-sent
9. Payment Confirmed     — Admin records payment received
```

Steps 3–8 can happen in parallel. The portal handles ordering — for example, the capital call only sends when **both** the PQ is approved **and** the SAFT is signed, regardless of which happens first.

---

## Setup (One-Time)

### 1. Upload Document Templates

Go to **Doc Templates** in the sidebar.

**CIS (Confidential Information Summary)** — upload once, shared across all rounds.
- File type: PDF
- This is a global document, not round-specific

**Per Round** — for each funding round:

- **SAFT Template** — Word `.docx` file with placeholder variables in curly braces
- **PPM (Private Placement Memorandum)** — PDF, one per round

**SAFT Placeholders** — use these in your Word document:

| Placeholder | Auto-filled? | Source |
|---|---|---|
| `{investor_name}` | Yes | Investor record |
| `{investor_email}` | Yes | Investor record |
| `{investment_amount_usd}` | Yes | Allocation |
| `{token_amount}` | Yes | Allocation |
| `{token_price}` | Yes | Round config |
| `{round_name}` | Yes | Round config |
| `{date}` | Yes | Generation date |
| `{investor_address}` | No — investor fills | During signing |
| `{investor_jurisdiction}` | No — investor fills | During signing |
| `{payment_method}` | No — investor fills | During signing |

Any custom `{placeholder}` you add will automatically appear as a field for the investor to fill in during signing. No code changes needed.

### 2. Configure Rounds

Ensure each funding round has the correct token price, vesting schedule, cliff, and TGE unlock percentage set in the database. These values feed into document generation and the investor dashboard.

### 3. Set Up Sumsub Webhook

Point Sumsub's webhook URL to `https://your-domain.com/api/webhooks/sumsub`. Set the `SUMSUB_WEBHOOK_SECRET` environment variable to match Sumsub's HMAC secret. The portal handles `applicantReviewed` (GREEN/RED) and `applicantPending` events.

---

## Daily Workflow

### Adding New Investors

1. Go to **Investors** → click **Add Investor**
2. Enter name, email, and country
3. **Add an allocation** — assign token amount + round. Do this early; it enables document auto-generation when KYC clears. The investor won't see the allocation on their dashboard until payment is confirmed.
4. The portal auto-sends a **welcome email** with a magic link

### What Happens Next (Automated)

Once the investor is added with an allocation:

1. **Investor clicks magic link** → lands on the portal, sees the jurisdiction gate (country confirmation + US Person attestation)
2. **KYC** — Sumsub widget loads, investor completes identity check
3. **Sumsub webhook fires** → portal auto-updates KYC status
4. **On KYC approval** → portal auto-generates the document set (SAFT, PPM, CIS) and emails the investor
5. **Investor views `/documents`** → sees the SAFT with any missing fields highlighted in amber
6. **Investor fills missing fields** (address, jurisdiction, payment method) → document re-renders live
7. **Investor scrolls to bottom → signs** → Certificate of Execution generated
8. **Investor visits `/pq`** → fills the 7-section Purchaser Questionnaire → submits

Steps 5–8 can happen in any order. The PQ and documents are sent together so the investor can reference the SAFT/PPM/CIS while completing the PQ.

### What Requires Manual Action

**PQ Review** — when an investor submits their PQ, you'll see a notification (bell icon in sidebar, marked "Action Required"). Open the investor's detail page, scroll to the PQ Review section, and go through the per-section checklist. Approve or reject.

- **On approval**: if the SAFT is already signed, the capital call auto-sends immediately. If the SAFT isn't signed yet, the capital call will auto-send when the investor signs.
- **On rejection**: the investor is notified to resubmit.

**Payment Recording** — when the investor pays:

1. Open the investor's detail page
2. Scroll to the allocation section
3. Update payment status: `paid`, `partial`, or mark the amount received
4. For partial payments: enter the amount received. The investor's dashboard will show tokens proportional to the paid amount and a "Remaining Balance" banner.

### Re-generation and Re-sending

- **Re-generate documents**: if you update a template or need to fix something, click "↻ Re-generate" on the investor detail page. This voids the old set and creates a fresh one. A new "Documents Ready" email is sent. Cannot re-generate signed documents.
- **Resend capital call**: if the email was lost, use the "Resend" button in the Capital Call section on the investor detail page.
- **Resend welcome email**: available in the Emails section.

---

## The Notification System

The bell icon in the admin sidebar shows unread notifications with a count badge. Notifications are created automatically at key moments:

| Event | Priority | What to do |
|---|---|---|
| **PQ Submitted** | Action Required | Review and approve/reject the PQ |
| **KYC Verified** | Info | Documents auto-generated — no action needed |
| **KYC Rejected** | Info | Investor may need to retry KYC |
| **SAFT Signed** | Info | If capital call was auto-sent, note is shown |
| **Payment Received** | Info | Confirm amount matches expectations |

The notification page has three filter tabs: **All**, **Action Required**, and **Unread**. Click "View Investor →" on any notification to jump to their detail page. Notifications auto-deduplicate (same investor + event type won't spam within 1 hour).

---

## The Workflow Stepper

Every investor detail page shows a 9-step progress bar at the top. Each step shows:

- **Green checkmark** — completed
- **Outlined circle with number** — current step (with a hint below on what's needed)
- **Amber exclamation** — warning (e.g., PQ rejected)
- **Gray circle** — future step

This gives you at-a-glance visibility into where each investor is and what's blocking progress.

---

## Understanding the Investor Dashboard

What the investor sees depends on their payment status:

| Payment Status | What Investor Sees |
|---|---|
| **Unpaid / Invoiced** | "Payment Due" banner with total amount. No token allocation shown. |
| **Partial** | "Remaining Balance" banner with outstanding amount. Token allocation shown proportional to payment received, tagged with "X% paid". |
| **Paid** | Full token allocation, vesting schedule, and stats. No payment banner. |

This means you can add allocations early (to trigger document generation) without the investor seeing any token counts until they've actually paid.

---

## Roles and Permissions

| Role | Can View | Can Edit | Notes |
|---|---|---|---|
| **Super Admin** | Everything | Everything | Full access, can manage team |
| **Admin** | Everything | Everything | Same as super admin |
| **Manager** | Everything | Everything | Can manage team members |
| **Staff** | All investors | Add only | Cannot edit, delete, or manage team |

Staff can add new investors and view all data, but cannot edit investor details, approve PQs, update payments, or generate documents. These restrictions ensure sensitive operations are only performed by managers or above.

---

## Common Scenarios

### Investor added before allocation is created

No problem. Documents will auto-generate once you add an allocation **and** KYC is verified. If KYC clears before the allocation exists, the system simply skips generation. You can manually generate later from the investor detail page.

### PQ approved before SAFT is signed

The capital call **will not** send yet. The investor detail page shows "Capital Call — Awaiting SAFT signature". Once the investor signs, the capital call auto-sends.

### SAFT signed before PQ is approved

Same logic in reverse. Capital call waits for PQ approval. Once you approve the PQ, it auto-sends.

### Investor needs to change their SAFT details after signing

Cannot modify a signed document. If critical, you'd need to void and re-issue (not currently supported for signed docs). For most cases, a supplementary agreement is preferable.

### Multiple rounds for one investor

Each round gets its own document set (SAFT + PPM). The investor sees them grouped by round in their Documents page. Each round's SAFT must be signed independently.

### Template updated after documents were already sent

Existing documents are not affected. If you need investors to sign the new version, re-generate their documents from the investor detail page.

---

## Email Summary

| Email | Trigger | Content |
|---|---|---|
| **Welcome** | Investor created | Magic link to portal |
| **Docs Package** | KYC verified | Links to PQ + document references |
| **Documents Ready** | Doc set generated | Link to /documents page |
| **Capital Call** | PQ approved + SAFT signed | Payment amount + instructions |
| **PQ Submitted** (internal) | Investor submits PQ | Audit log entry |
| **SAFT Signed** (internal) | Investor signs | Audit log entry |

---

## Technical Notes

### Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL       — Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY  — Supabase anon/public key
SUPABASE_SERVICE_ROLE_KEY      — Supabase service role key
SUMSUB_WEBHOOK_SECRET          — Sumsub HMAC secret
RESEND_API_KEY                 — Resend API key (optional)
EMAIL_FROM                     — Sender address (optional)
```

### Database Migrations

Run in order in Supabase SQL Editor:

```
migration-001-core.sql                  — investors, saft_rounds, allocations
migration-002-admin-roles.sql           — admin_users, roles
migration-003-jurisdiction-gate.sql     — country dropdown, US attestation
migration-004-staff-permissions.sql     — staff role restrictions
migration-005-payment-pq-email.sql      — payments, PQ fields, email events
migration-006-documents-signing.sql     — doc_templates, investor_documents, signing_events
migration-007-missing-variables.sql     — missing_variables JSONB column
migration-008-admin-notifications.sql   — admin_notifications table
```

### Storage Buckets

Create one private bucket in Supabase Storage: **`documents`** (no public access).

### Dependencies

After deploying, run `npm install` to ensure these packages are available:
`docxtemplater`, `pizzip`, `mammoth`, `pdf-lib`
