# Kayan Token — Investor Portal

Pre-TGE investor dashboard for tracking $KAYAN token allocations, vesting schedules, and verification status. Built for 200+ SAFT investors.

## Tech Stack

- **Next.js 14** (App Router, Server Components)
- **Supabase** (Auth, PostgreSQL, RLS)
- **Tailwind CSS** (styling)
- **Recharts** (vesting visualization)
- **Vercel** (recommended hosting)

## Quick Start

### 1. Clone & Install

```bash
git clone <your-repo>
cd kayan-portal
npm install
```

### 2. Set Up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run the contents of `supabase/schema.sql`
3. Go to **Authentication > URL Configuration** and add your redirect URL:
   - Local: `http://localhost:3000/auth/callback`
   - Production: `https://your-domain.com/auth/callback`
4. Go to **Authentication > Email Templates** and customize the magic link email (optional)

### 3. Configure Environment

```bash
cp .env.local.example .env.local
```

Fill in your Supabase credentials (found in **Settings > API**):

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # keep this secret!
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 4. Add Your Admin!

In the Supabase SQL Editor:

```sql
INSERT INTO admin_users (email, role)
VALUES ('your-email@example.com', 'super_admin');
```

### 5. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Project Structure

```
/app
  /login              → Magic link auth page
  /(authenticated)
    /dashboard        → Investor dashboard (main view)
    /settings         → Account info
    /admin            → Admin investor list
    /admin/investors  → Investor detail/edit
    /admin/rounds     → SAFT round management
    /admin/import     → CSV bulk import
  /auth/callback      → Magic link verification handler
  /api/admin          → Protected admin API routes
/components
  /ui                 → Reusable primitives (Card, Button, Badge, Sidebar)
  /dashboard          → Dashboard-specific components
/lib
  supabase.ts         → Browser client
  supabase-server.ts  → Server client (with RLS) + Admin client (bypasses RLS)
  vesting.ts          → Token unlock calculations
  types.ts            → TypeScript interfaces
/supabase
  schema.sql          → Database schema, RLS policies, seed data
```

## Security Model

- **Supabase RLS** enforces data isolation — investors only see their own records
- **Admin routes** are double-protected: layout checks `admin_users` table, API routes verify independently
- **Service role key** is server-side only — never exposed to the browser
- **Magic link auth** — no passwords to manage or leak

## Deployment (Vercel)

1. Push to GitHub
2. Import project in Vercel
3. Add environment variables in Vercel dashboard
4. Deploy

The magic link redirect URL must be updated to your production domain in Supabase.

## CSV Import Format

```csv
email,full_name,round_name,token_amount
jane@example.com,Jane Doe,Seed,50000
bob@example.com,Bob Smith,Private,25000
```

- `round_name` must match an existing round exactly
- Existing investors (by email) won't be duplicated — new allocation is added
- Preview rows before importing

## Status

This is a **pre-TGE** informational portal. The following features are placeholders:
- KYC verification flow (button disabled)
- Wallet connection (button disabled)
- Token withdrawals / on-chain claims
- Vesting shows 0% until TGE date is set
