# Phase 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A runnable Next.js + Supabase project with login, session protection, organization-scoped Row-Level Security, and verification that users cannot read or modify records outside their organization.

**Architecture:** Modular monolith. Next.js App Router with a route group `(app)` for authenticated pages and `(auth)` for the login page. All database access goes through Supabase clients — a browser client (`lib/supabase/client.ts`), a server client with cookie handling (`server/supabase/server.ts`), and a middleware session-refresh (`server/supabase/middleware.ts`). Authorization is enforced twice: PostgreSQL RLS policies scoped by `organization_membership` rows, and a server-side `requireOrganization()` guard in every authenticated layout/action. The database schema is created entirely by versioned Supabase migrations plus `seed.sql` for the demo accountant and organization.

**Tech Stack:** Next.js (App Router, TypeScript strict), Tailwind CSS, shadcn/ui, TanStack Table, @supabase/ssr + @supabase/supabase-js, decimal.js, Vitest, Playwright, Supabase CLI, Docker (local Supabase stack).

**Spec:** `docs/superpowers/specs/2026-08-19-erp-v0-design.md`

## Global Constraints

- Platform: Windows 11, PowerShell 5.1 shell. No `&&` chaining — use `; if ($?) { ... }`. `>` redirection writes UTF-16 — never redirect CLI output to a file; use the tool's `--output` flag instead.
- Node >= 20 (verified: v24.19.0), npm 11.17.0, git 2.55.
- **Docker Desktop is required** for `supabase start`. If Docker is missing, DB verification tasks (5, 6, 7, 9, 10) cannot pass — install it before starting.
- TypeScript strict mode enabled (create-next-app default) — never disable.
- Money is `NUMERIC(19,4)` in PostgreSQL and `decimal.js` in TypeScript. No JavaScript floating-point arithmetic on money, ever. `src/lib/money.ts` is the only place that touches Decimal.
- No Prisma, Auth.js, Redux, event buses, queues, microservices, or a second backend framework.
- All company-owned tables carry `organization_id` and are RLS-protected via `organization_membership`.
- The Supabase service-role key is server-only. It never appears in client components or `NEXT_PUBLIC_` env vars.
- Secrets never committed: `.env*` is gitignored; only `.env.example` is committed.
- Schema changes go through `supabase/migrations/*.sql` only. No manual database edits.
- Every task ends with a commit. Commit messages follow `feat:` / `chore:` / `test:` prefixes.
- Business timezone `Asia/Manila`; business dates are PostgreSQL `DATE`; system timestamps UTC.
- User-facing error messages are generic; never expose stack traces or database details.

---

### Task 1: Scaffold the Next.js project and initialize git

**Files:**

- Create: whole project scaffold (`package.json`, `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `app` files, `.gitignore`)
- Test: none (scaffold verification is build + dev server)

**Interfaces:**

- Produces: `package.json` with `dev`, `build`, `start`, `lint` scripts; `src/` directory layout; `@/*` path alias; Tailwind v4 configured.

- [ ] **Step 1: Verify prerequisites**

Run: `node --version; npm --version; git --version`
Expected: Node >= 20, npm >= 10, git present.

- [ ] **Step 2: Scaffold the app in the current directory**

Run: `npx create-next-app@latest . --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --yes`
Expected: project files created. `docs/` is untouched (create-next-app only errors on conflicting files).

- [ ] **Step 3: Verify the scaffold builds**

Run: `npm run build`
Expected: production build succeeds. Then `npm run dev` once, confirm `http://localhost:3000` renders, stop it.

- [ ] **Step 4: Add the typecheck script**

Modify: `package.json` scripts:

```json
"typecheck": "tsc --noEmit"
```

- [ ] **Step 5: Initialize git and make the first commit**

```bash
git init
git add .
git commit -m "chore: scaffold Next.js app with create-next-app"
```

---

### Task 2: Add Prettier and format baseline

**Files:**

- Create: `.prettierrc`
- Modify: `package.json` (format script), `eslint.config.mjs`

**Interfaces:**

- Produces: `npm run format` and `npm run lint` as the canonical formatting/lint commands for all later tasks.

- [ ] **Step 1: Install and configure Prettier**

```bash
npm i -D prettier eslint-config-prettier
```

Create `.prettierrc`:

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100
}
```

- [ ] **Step 2: Wire Prettier into ESLint**

Read `eslint.config.mjs` (created by create-next-app) and append the Prettier config as the last item in the exported array:

```ts
import prettier from 'eslint-config-prettier';

const eslintConfig = [...existingEntries, prettier];

export default eslintConfig;
```

- [ ] **Step 3: Add the format script**

Modify: `package.json` scripts:

```json
"format": "prettier --write .",
"format:check": "prettier --check ."
```

- [ ] **Step 4: Run format and lint to establish the baseline**

```bash
npm run format; npm run lint
```

Expected: files reformatted, `npm run lint` exits 0.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "chore: add prettier and eslint integration"
```

---

### Task 3: Initialize shadcn/ui and install foundational libraries

**Files:**

- Create: `components.json`, `src/components/ui/*` (shadcn primitives), `src/lib/utils.ts`
- Modify: `src/app/globals.css`, `package.json`

**Interfaces:**

- Produces: shadcn/ui primitives available as `@/components/ui/<name>`; `cn()` at `src/lib/utils.ts`; TanStack Table installed (used from Phase 2 onward); root layout with `Toaster` and `Geist` fonts.

- [ ] **Step 1: Initialize shadcn/ui**

```bash
npx shadcn@latest init --yes --base-color neutral
```

Expected: `components.json` created, `src/app/globals.css` gets CSS variables, `src/lib/utils.ts` created.

- [ ] **Step 2: Add the V0 primitive set**

```bash
npx shadcn@latest add button input label card badge table dialog dropdown-menu sonner separator skeleton --yes
```

Expected: `src/components/ui/` populated with the requested components.

- [ ] **Step 3: Install the foundational libraries**

```bash
npm i @supabase/ssr @supabase/supabase-js @tanstack/react-table decimal.js server-only
npm i -D vitest @playwright/test supabase dotenv
```

- [ ] **Step 4: Mount the Toaster in the root layout**

Read `src/app/layout.tsx` and wrap it so it reads:

```tsx
import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { Toaster } from '@/components/ui/sonner';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'ERP V0',
  description: 'Single-company accounting prototype for one pilot accountant',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
```

- [ ] **Step 5: Verify**

Run: `npm run lint; npm run typecheck; npm run build`
Expected: all three pass.

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat: add shadcn/ui, sonner, and foundational libraries"
```

---

### Task 4: Vitest harness + exact-decimal money layer (TDD)

**Files:**

- Create: `vitest.config.ts`, `tests/setup.ts`, `tests/unit/lib/money.test.ts`, `tests/unit/lib/format.test.ts`, `src/lib/money.ts`, `src/lib/format.ts`
- Modify: `package.json` (test scripts)

**Interfaces:**

- Consumes: `decimal.js` (Task 3).
- Produces (used by every later task and by Phase 3/4/5 services):
  - `MONEY_SCALE: 4`
  - `toDecimal(value: string | number | Decimal): Decimal`
  - `add(a: DecimalInput, b: DecimalInput): Decimal`
  - `sub(a: DecimalInput, b: DecimalInput): Decimal`
  - `isZero(value: DecimalInput): boolean`
  - `isPositive(value: DecimalInput): boolean`
  - `isNegative(value: DecimalInput): boolean`
  - `isBalanced(debits: DecimalInput[], credits: DecimalInput[]): boolean`
  - `toDbString(value: DecimalInput, scale?: number): string`
  - `formatPHP(value: DecimalInput): string` (en-PH, PHP)
  - `formatBusinessDate(isoDate: string): string` (Asia/Manila)
  - Where `DecimalInput = string | number | Decimal`.

- [ ] **Step 1: Configure Vitest**

Create `vitest.config.ts`:

```ts
import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
  },
});
```

Create `tests/setup.ts`:

```ts
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '..', '.env.test') });
```

- [ ] **Step 2: Write the failing money tests**

Create `tests/unit/lib/money.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { Decimal } from 'decimal.js';
import {
  add,
  isBalanced,
  isNegative,
  isPositive,
  isZero,
  sub,
  toDbString,
  toDecimal,
} from '@/lib/money';

describe('money', () => {
  it('adds without floating-point drift', () => {
    expect(add('0.1', '0.2').toString()).toBe('0.3');
  });

  it('subtracts exactly', () => {
    expect(sub('1.00', '0.01').toString()).toBe('0.99');
  });

  it('wraps Decimal instances unchanged', () => {
    const d = toDecimal(new Decimal('42.50'));
    expect(d.toString()).toBe('42.5');
  });

  it('rejects NaN and non-numeric strings', () => {
    expect(() => toDecimal('abc')).toThrow('Invalid monetary value');
    expect(() => toDecimal('')).toThrow('Invalid monetary value');
    expect(() => toDecimal(NaN)).toThrow('Invalid monetary value');
    expect(() => toDecimal(Infinity)).toThrow('Invalid monetary value');
  });

  it('detects zero, positive, and negative', () => {
    expect(isZero('0')).toBe(true);
    expect(isPositive('0.01')).toBe(true);
    expect(isNegative('-0.01')).toBe(true);
    expect(isPositive('0')).toBe(false);
  });

  it('detects balanced debit/credit sets', () => {
    expect(isBalanced(['100.00', '50.00'], ['150.00'])).toBe(true);
    expect(isBalanced(['100.00'], ['99.99'])).toBe(false);
  });

  it('serializes to the NUMERIC(19,4) database scale', () => {
    expect(toDbString('1.5')).toBe('1.5000');
    expect(toDbString('1.23456')).toBe('1.2346');
    expect(toDbString('0')).toBe('0.0000');
  });
});
```

Create `tests/unit/lib/format.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatBusinessDate, formatPHP } from '@/lib/format';

describe('format', () => {
  it('formats PHP amounts with en-PH locale', () => {
    expect(formatPHP('1234.56')).toBe('₱1,234.56');
    expect(formatPHP('1000000')).toBe('₱1,000,000.00');
  });

  it('formats zero', () => {
    expect(formatPHP('0')).toBe('₱0.00');
  });

  it('formats ISO dates without timezone drift', () => {
    expect(formatBusinessDate('2026-07-15')).toBe('Jul 15, 2026');
  });
});
```

- [ ] **Step 3: Run the tests and confirm they fail**

```bash
npm i -D vitest
npx vitest run tests/unit/lib/money.test.ts tests/unit/lib/format.test.ts
```

Expected: FAIL — `@/lib/money` and `@/lib/format` cannot be resolved.

- [ ] **Step 4: Implement `src/lib/money.ts`**

```ts
import Decimal from 'decimal.js';

export type DecimalInput = string | number | Decimal;

export const MONEY_SCALE = 4;

export function toDecimal(value: DecimalInput): Decimal {
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new Error('Invalid monetary value');
  }
  const d = value instanceof Decimal ? value : new Decimal(value);
  if (d.isNaN()) {
    throw new Error('Invalid monetary value');
  }
  return d;
}

export function add(a: DecimalInput, b: DecimalInput): Decimal {
  return toDecimal(a).plus(toDecimal(b));
}

export function sub(a: DecimalInput, b: DecimalInput): Decimal {
  return toDecimal(a).minus(toDecimal(b));
}

export function isZero(value: DecimalInput): boolean {
  return toDecimal(value).isZero();
}

export function isPositive(value: DecimalInput): boolean {
  return toDecimal(value).isPositive();
}

export function isNegative(value: DecimalInput): boolean {
  return toDecimal(value).isNegative();
}

export function isBalanced(debits: DecimalInput[], credits: DecimalInput[]): boolean {
  const totalDebit = debits.reduce((sum, d) => sum.plus(toDecimal(d)), new Decimal(0));
  const totalCredit = credits.reduce((sum, d) => sum.plus(toDecimal(d)), new Decimal(0));
  return totalDebit.equals(totalCredit);
}

export function toDbString(value: DecimalInput, scale = MONEY_SCALE): string {
  return toDecimal(value).toFixed(scale);
}
```

- [ ] **Step 5: Implement `src/lib/format.ts`**

```ts
import { toDecimal, type DecimalInput } from '@/lib/money';

const phpFormatter = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });

export function formatPHP(value: DecimalInput): string {
  return phpFormatter.format(Number(toDecimal(value).toFixed(2)));
}

export function formatBusinessDate(isoDate: string): string {
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(new Date(`${isoDate}T00:00:00`));
}
```

- [ ] **Step 6: Run the tests and confirm they pass**

```bash
npx vitest run tests/unit/lib/money.test.ts tests/unit/lib/format.test.ts
```

Expected: 12 tests PASS. Note: `toDbString('1.23456')` must produce `1.2346` (decimal.js default rounding is half-up — matches NUMERIC rounding).

- [ ] **Step 7: Add the test scripts and commit**

Modify: `package.json` scripts:

```json
"test": "vitest run",
"test:watch": "vitest"
```

```bash
git add .
git commit -m "feat: add exact-decimal money layer with vitest harness"
```

---

### Task 5: Supabase project init + core schema migrations (00001–00005)

**Files:**

- Create: `supabase/config.toml`, `supabase/migrations/00001_extensions.sql`, `00002_profile.sql`, `00003_organization.sql`, `00004_fiscal_period.sql`, `00005_account.sql`

**Interfaces:**

- Consumes: Docker Desktop (prerequisite), `supabase` CLI via npx.
- Produces: database tables `profile`, `organization`, `organization_membership`, `fiscal_period`, `account` with enums `membership_role`, `fiscal_period_status`, `account_type`, `normal_balance`; helper `public.set_updated_at()` trigger; extension `pgcrypto` (seed password hashing) and `btree_gist` (period-overlap exclusion).

- [ ] **Step 1: Verify Docker**

Run: `docker --version`
Expected: version printed. If Docker is missing, stop — install Docker Desktop, start it, then continue. (All later steps in this task and Tasks 6, 7, 9, 10 depend on the local Supabase stack.)

- [ ] **Step 2: Initialize the Supabase project**

```bash
npx supabase init
```

Expected: `supabase/config.toml` created. Leave `supabase/functions/` alone — V0 uses no Edge Functions.

- [ ] **Step 3: Write `00001_extensions.sql`**

```sql
create extension if not exists pgcrypto;
create extension if not exists btree_gist;
```

- [ ] **Step 4: Write `00002_profile.sql`**

```sql
create table public.profile (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profile_set_updated_at
  before update on public.profile
  for each row execute function public.set_updated_at();
```

- [ ] **Step 5: Write `00003_organization.sql`**

```sql
create type public.membership_role as enum ('ACCOUNTANT');

create table public.organization (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text not null,
  currency_code text not null default 'PHP',
  timezone text not null default 'Asia/Manila',
  fiscal_year_start_month integer not null default 1 check (fiscal_year_start_month between 1 and 12),
  tin text,
  rdo text,
  tax_classification text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger organization_set_updated_at
  before update on public.organization
  for each row execute function public.set_updated_at();

create table public.organization_membership (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization (id) on delete cascade,
  user_id uuid not null references public.profile (id) on delete cascade,
  role public.membership_role not null default 'ACCOUNTANT',
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index organization_membership_user_idx on public.organization_membership (user_id);
```

- [ ] **Step 6: Write `00004_fiscal_period.sql`**

```sql
create type public.fiscal_period_status as enum ('OPEN', 'CLOSED');

create table public.fiscal_period (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization (id) on delete cascade,
  name text not null,
  start_date date not null,
  end_date date not null,
  status public.fiscal_period_status not null default 'OPEN',
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date),
  unique (organization_id, name),
  exclude using gist (
    organization_id with =,
    daterange(start_date, end_date, '[]') with &&
  )
);

create trigger fiscal_period_set_updated_at
  before update on public.fiscal_period
  for each row execute function public.set_updated_at();

create index fiscal_period_org_idx on public.fiscal_period (organization_id);
```

- [ ] **Step 7: Write `00005_account.sql`**

```sql
create type public.account_type as enum ('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE');
create type public.normal_balance as enum ('DEBIT', 'CREDIT');

create table public.account (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization (id) on delete cascade,
  code text not null,
  name text not null,
  type public.account_type not null,
  normal_balance public.normal_balance not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

create trigger account_set_updated_at
  before update on public.account
  for each row execute function public.set_updated_at();

create index account_org_idx on public.account (organization_id);
```

- [ ] **Step 8: Start the local stack and verify migrations apply**

```bash
npx supabase start
npx supabase db reset
```

Expected: containers start (first run downloads images — several minutes), `db reset` applies 00001–00005 with no errors.

- [ ] **Step 9: Commit**

```bash
git add supabase
git commit -m "feat: add supabase project with core schema migrations"
```

---

### Task 6: Journal, import, and audit schema migrations (00006–00008)

**Files:**

- Create: `supabase/migrations/00006_journal_entry.sql`, `00007_import_batch.sql`, `00008_audit_event.sql`

**Interfaces:**

- Consumes: tables from Task 5.
- Produces: `journal_entry`, `journal_line`, `import_batch`, `audit_event` with enums `journal_status`, `journal_entry_type`, `import_type`, `import_batch_status`. Journal lines enforce double-entry shape at the DB level (exactly one of debit/credit, both non-negative). `journal_entry.entry_number` is NULL while Draft and assigned at posting (Phase 3); unique per `(organization_id, entry_number)`.

- [ ] **Step 1: Write `00006_journal_entry.sql`**

```sql
create type public.journal_status as enum ('DRAFT', 'POSTED', 'REVERSED');
create type public.journal_entry_type as enum ('STANDARD', 'OPENING', 'ADJUSTING', 'REVERSAL');

create table public.journal_entry (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization (id) on delete cascade,
  fiscal_period_id uuid not null references public.fiscal_period (id),
  entry_number bigint,
  entry_date date not null,
  reference text not null,
  description text not null,
  notes text,
  status public.journal_status not null default 'DRAFT',
  entry_type public.journal_entry_type not null default 'STANDARD',
  reversal_of_id uuid references public.journal_entry (id),
  total_debit numeric(19,4) not null default 0 check (total_debit >= 0),
  total_credit numeric(19,4) not null default 0 check (total_credit >= 0),
  created_by_id uuid not null references public.profile (id),
  posted_by_id uuid references public.profile (id),
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, entry_number)
);

create trigger journal_entry_set_updated_at
  before update on public.journal_entry
  for each row execute function public.set_updated_at();

create index journal_entry_org_date_idx on public.journal_entry (organization_id, entry_date);
create index journal_entry_org_status_idx on public.journal_entry (organization_id, status);

create table public.journal_line (
  id uuid primary key default gen_random_uuid(),
  journal_entry_id uuid not null references public.journal_entry (id) on delete cascade,
  account_id uuid not null references public.account (id),
  line_number integer not null check (line_number > 0),
  description text,
  debit numeric(19,4) not null default 0 check (debit >= 0),
  credit numeric(19,4) not null default 0 check (credit >= 0),
  tax_code text,
  check (debit = 0 or credit = 0),
  check (debit > 0 or credit > 0),
  unique (journal_entry_id, line_number)
);

create index journal_line_entry_idx on public.journal_line (journal_entry_id);
```

- [ ] **Step 2: Write `00007_import_batch.sql`**

```sql
create type public.import_type as enum ('CHART_OF_ACCOUNTS', 'JOURNAL_ENTRIES');
create type public.import_batch_status as enum ('UPLOADED', 'VALIDATED', 'IMPORTED', 'FAILED');

create table public.import_batch (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization (id) on delete cascade,
  file_name text not null,
  import_type public.import_type not null,
  status public.import_batch_status not null default 'UPLOADED',
  row_count integer not null default 0 check (row_count >= 0),
  valid_row_count integer not null default 0 check (valid_row_count >= 0),
  invalid_row_count integer not null default 0 check (invalid_row_count >= 0),
  created_by_id uuid not null references public.profile (id),
  created_at timestamptz not null default now()
);

create index import_batch_org_idx on public.import_batch (organization_id);
```

- [ ] **Step 3: Write `00008_audit_event.sql`**

```sql
create table public.audit_event (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization (id) on delete cascade,
  user_id uuid not null references public.profile (id),
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index audit_event_org_created_idx on public.audit_event (organization_id, created_at);
```

- [ ] **Step 4: Verify migrations apply cleanly**

```bash
npx supabase db reset
```

Expected: all 8 migrations apply with no errors. The `exclude using gist` constraint requires `btree_gist` (created in 00001) — if reset fails on that line, confirm 00001 applied first.

- [ ] **Step 5: Commit**

```bash
git add supabase
git commit -m "feat: add journal, import, and audit schema"
```

---

### Task 7: Row-Level Security policies (00009) + seed data

**Files:**

- Create: `supabase/migrations/00009_rls_policies.sql`, `supabase/seed.sql`

**Interfaces:**

- Consumes: all tables from Tasks 5–6.
- Produces:
  - RLS enabled on all 9 tables. Policies allow select on org-scoped tables only when a matching `organization_membership` row exists for `auth.uid()`; profile policies are self-scoped; insert/update policies exist for `account`, `journal_entry`, `journal_line`, `import_batch` so later phases can CRUD (always org-checked). The membership check uses an inline `exists` subquery against `organization_membership`, whose own policy permits self-read — no security definer functions.
  - `seed.sql` with fixed UUIDs: demo accountant `accountant@v0.local` / `demo-pass-123`, organization **V0 Accounting Demo**, membership, and one OPEN fiscal period **July 2026 Test Period** (2026-07-01 → 2026-07-31).

- [ ] **Step 1: Write `00009_rls_policies.sql`**

```sql
alter table public.profile enable row level security;
alter table public.organization enable row level security;
alter table public.organization_membership enable row level security;
alter table public.fiscal_period enable row level security;
alter table public.account enable row level security;
alter table public.journal_entry enable row level security;
alter table public.journal_line enable row level security;
alter table public.import_batch enable row level security;
alter table public.audit_event enable row level security;

-- profile: users may read and update only their own profile row
create policy "profile_select_own" on public.profile
  for select using (id = auth.uid());
create policy "profile_insert_own" on public.profile
  for insert with check (id = auth.uid());
create policy "profile_update_own" on public.profile
  for update using (id = auth.uid());

-- membership: users may read their own membership rows (used by all other policies)
create policy "membership_select_own" on public.organization_membership
  for select using (user_id = auth.uid());

-- organization: readable when the user is a member
create policy "organization_select_member" on public.organization
  for select using (
    exists (
      select 1 from public.organization_membership om
      where om.organization_id = organization.id
        and om.user_id = auth.uid()
    )
  );

-- fiscal_period
create policy "fiscal_period_select_org" on public.fiscal_period
  for select using (
    exists (
      select 1 from public.organization_membership om
      where om.organization_id = fiscal_period.organization_id
        and om.user_id = auth.uid()
    )
  );

-- account
create policy "account_select_org" on public.account
  for select using (
    exists (
      select 1 from public.organization_membership om
      where om.organization_id = account.organization_id
        and om.user_id = auth.uid()
    )
  );
create policy "account_insert_org" on public.account
  for insert with check (
    exists (
      select 1 from public.organization_membership om
      where om.organization_id = account.organization_id
        and om.user_id = auth.uid()
    )
  );
create policy "account_update_org" on public.account
  for update using (
    exists (
      select 1 from public.organization_membership om
      where om.organization_id = account.organization_id
        and om.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.organization_membership om
      where om.organization_id = account.organization_id
        and om.user_id = auth.uid()
    )
  );

-- journal_entry
create policy "journal_entry_select_org" on public.journal_entry
  for select using (
    exists (
      select 1 from public.organization_membership om
      where om.organization_id = journal_entry.organization_id
        and om.user_id = auth.uid()
    )
  );
create policy "journal_entry_insert_org" on public.journal_entry
  for insert with check (
    exists (
      select 1 from public.organization_membership om
      where om.organization_id = journal_entry.organization_id
        and om.user_id = auth.uid()
    )
  );
create policy "journal_entry_update_org" on public.journal_entry
  for update using (
    exists (
      select 1 from public.organization_membership om
      where om.organization_id = journal_entry.organization_id
        and om.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.organization_membership om
      where om.organization_id = journal_entry.organization_id
        and om.user_id = auth.uid()
    )
  );

-- journal_line: access through the owning entry's organization
create policy "journal_line_select_org" on public.journal_line
  for select using (
    exists (
      select 1 from public.journal_entry je
      join public.organization_membership om on om.organization_id = je.organization_id
      where je.id = journal_line.journal_entry_id
        and om.user_id = auth.uid()
    )
  );
create policy "journal_line_insert_org" on public.journal_line
  for insert with check (
    exists (
      select 1 from public.journal_entry je
      join public.organization_membership om on om.organization_id = je.organization_id
      where je.id = journal_line.journal_entry_id
        and om.user_id = auth.uid()
    )
  );
create policy "journal_line_update_org" on public.journal_line
  for update using (
    exists (
      select 1 from public.journal_entry je
      join public.organization_membership om on om.organization_id = je.organization_id
      where je.id = journal_line.journal_entry_id
        and om.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.journal_entry je
      join public.organization_membership om on om.organization_id = je.organization_id
      where je.id = journal_line.journal_entry_id
        and om.user_id = auth.uid()
    )
  );

-- import_batch
create policy "import_batch_select_org" on public.import_batch
  for select using (
    exists (
      select 1 from public.organization_membership om
      where om.organization_id = import_batch.organization_id
        and om.user_id = auth.uid()
    )
  );
create policy "import_batch_insert_org" on public.import_batch
  for insert with check (
    exists (
      select 1 from public.organization_membership om
      where om.organization_id = import_batch.organization_id
        and om.user_id = auth.uid()
    )
  );

-- audit_event
create policy "audit_event_select_org" on public.audit_event
  for select using (
    exists (
      select 1 from public.organization_membership om
      where om.organization_id = audit_event.organization_id
        and om.user_id = auth.uid()
    )
  );
```

- [ ] **Step 2: Write `supabase/seed.sql`**

Fixed UUIDs: accountant `11111111-1111-1111-1111-111111111111`, org `22222222-2222-2222-2222-222222222222`.

```sql
-- Demo accountant (Supabase Auth user). Password: demo-pass-123
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change,
  email_change_token_new, email_change_token_current
) values (
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-1111-1111-111111111111',
  'authenticated', 'authenticated',
  'accountant@v0.local',
  crypt('demo-pass-123', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(), now(),
  '', '', '', '', ''
) on conflict (id) do nothing;

insert into auth.identities (
  provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
) values (
  '11111111-1111-1111-1111-111111111111',
  '11111111-1111-1111-1111-111111111111',
  '{"sub":"11111111-1111-1111-1111-111111111111","email":"accountant@v0.local"}',
  'email', now(), now(), now()
) on conflict (provider_id, provider) do nothing;

insert into public.profile (id, name) values ('11111111-1111-1111-1111-111111111111', 'Demo Accountant')
on conflict (id) do nothing;

insert into public.organization (id, name, legal_name, currency_code, timezone, fiscal_year_start_month)
values ('22222222-2222-2222-2222-222222222222', 'V0 Accounting Demo', 'V0 Accounting Demo', 'PHP', 'Asia/Manila', 1)
on conflict (id) do nothing;

insert into public.organization_membership (organization_id, user_id, role)
values ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'ACCOUNTANT')
on conflict (organization_id, user_id) do nothing;

insert into public.fiscal_period (organization_id, name, start_date, end_date, status)
values ('22222222-2222-2222-2222-222222222222', 'July 2026 Test Period', '2026-07-01', '2026-07-31', 'OPEN')
on conflict (organization_id, name) do nothing;
```

- [ ] **Step 3: Apply and verify**

```bash
npx supabase db reset
```

Expected: migrations + seed apply cleanly, no errors.

- [ ] **Step 4: Commit**

```bash
git add supabase
git commit -m "feat: add RLS policies and demo seed data"
```

---

### Task 8: Supabase clients, middleware, auth, and app shell

**Files:**

- Create: `src/lib/supabase/client.ts`, `src/server/supabase/server.ts`, `src/server/supabase/middleware.ts`, `src/middleware.ts`, `src/server/auth.ts`, `src/server/actions/auth-actions.ts`, `src/components/auth/login-form.tsx`, `src/components/layout/sidebar.tsx`, `src/components/layout/user-menu.tsx`, `src/app/(auth)/login/page.tsx`, `src/app/(app)/layout.tsx`, `src/app/(app)/page.tsx`, `src/app/(app)/dashboard/page.tsx`, `src/types/database.ts`
- Modify: `src/app/page.tsx` (root redirect), `src/app/globals.css` (minor), `package.json`

**Interfaces:**

- Consumes: seeded org/accountant (Task 7), RLS policies, `@supabase/ssr`.
- Produces (used by all later phases):
  - `createClient()` in `lib/supabase/client.ts` — browser client, typed with `Database`.
  - `createClient()` in `server/supabase/server.ts` — server client reading/writing cookies via `next/headers`.
  - `updateSession(request: NextRequest): Promise<NextResponse>` in `server/supabase/middleware.ts` — refreshes session; redirects unauthenticated users away from protected paths to `/login`; redirects authenticated users away from `/login` to `/dashboard`.
  - `src/types/database.ts` — generated Supabase types (`Database`).
  - From `server/auth.ts`:
    - `requireSession(): Promise<{ user: User }>` — redirects to `/login` when unauthenticated.
    - `getOrganizationContext(): Promise<{ user; profile; membership; organization } | null>`
    - `requireOrganization(): Promise<{ user; profile; membership; organization }>` — redirects to `/login` when no org context (page guard).
    - `requireOrganizationAction(): Promise<{ user; profile; membership; organization }>` — throws `UnauthorizedError` when no org context (server-action guard).
  - From `actions/auth-actions.ts`: `login(prevState: LoginState, formData: FormData): Promise<LoginState>` (redirects to `/dashboard` on success, returns `{ error }` on failure), `logout(): Promise<void>` (redirects to `/login`). `LoginState = { error: string | null }`.
  - App shell at `(app)/layout.tsx` with sidebar navigation (Dashboard, Accounts, Journal, Imports, Reports) and org name in the header.

- [ ] **Step 1: Generate the database types**

With the local stack running (Task 5), run:

```bash
npx supabase gen types typescript --local --output src/types/database.ts
```

Expected: `src/types/database.ts` created with `Database` matching the Phase 1 schema. Do NOT use PowerShell `>` redirection — it writes UTF-16; the `--output` flag writes UTF-8.

- [ ] **Step 2: Write the browser client**

Create `src/lib/supabase/client.ts`:

```ts
import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/database';

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

- [ ] **Step 3: Write the server client**

Create `src/server/supabase/server.ts`:

```ts
import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/types/database';

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component; safe to ignore when middleware refreshes sessions.
          }
        },
      },
    },
  );
}
```

- [ ] **Step 4: Write the middleware session helper**

Create `src/server/supabase/middleware.ts`:

```ts
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PROTECTED_PREFIXES = ['/dashboard', '/accounts', '/journal', '/imports', '/reports'];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  if (user && pathname === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return response;
}
```

- [ ] **Step 5: Write `src/middleware.ts`**

```ts
import type { NextRequest } from 'next/server';
import { updateSession } from '@/server/supabase/middleware';

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
```

- [ ] **Step 6: Write the auth guards**

Create `src/server/auth.ts`:

```ts
import 'server-only';
import { redirect } from 'next/navigation';
import { createClient } from '@/server/supabase/server';
import type { Profile, Organization, OrganizationMembership } from '@/types/database';

export class UnauthorizedError extends Error {
  constructor() {
    super('Not authorized');
    this.name = 'UnauthorizedError';
  }
}

export async function requireSession() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login');
  }
  return { user };
}

export async function getOrganizationContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profile')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile) return null;

  const { data: membership } = await supabase
    .from('organization_membership')
    .select('*, organization(*)')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!membership) return null;

  return {
    user,
    profile: profile as Profile,
    membership: membership as OrganizationMembership & { organization: Organization },
    organization: (membership as OrganizationMembership & { organization: Organization })
      .organization,
  };
}

export async function requireOrganization() {
  const ctx = await getOrganizationContext();
  if (!ctx) {
    redirect('/login');
  }
  return ctx;
}

export async function requireOrganizationAction() {
  const ctx = await getOrganizationContext();
  if (!ctx) {
    throw new UnauthorizedError();
  }
  return ctx;
}
```

- [ ] **Step 7: Write the auth server actions**

Create `src/server/actions/auth-actions.ts`:

```ts
'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/server/supabase/server';

export type LoginState = { error: string | null };

export async function login(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: 'Invalid email or password.' };
  }

  redirect('/dashboard');
}

export async function logout(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
```

- [ ] **Step 8: Write the login page and form**

Create `src/app/(auth)/login/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/server/supabase/server';
import { LoginForm } from '@/components/auth/login-form';

export default async function LoginPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect('/dashboard');
  }

  return <LoginForm />;
}
```

Create `src/components/auth/login-form.tsx`:

```tsx
'use client';

import { useActionState } from 'react';
import { login, type LoginState } from '@/server/actions/auth-actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function LoginForm() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(login, { error: null });

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>Use your accountant credentials to continue.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" autoComplete="email" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </div>
            {state.error ? (
              <p className="text-sm text-destructive" role="alert">
                {state.error}
              </p>
            ) : null}
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
```

- [ ] **Step 9: Write the app shell**

Create `src/app/(app)/layout.tsx`:

```tsx
import { requireOrganization } from '@/server/auth';
import { Sidebar } from '@/components/layout/sidebar';
import { UserMenu } from '@/components/layout/user-menu';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { organization, profile } = await requireOrganization();

  return (
    <div className="flex min-h-screen">
      <Sidebar organizationName={organization.name} />
      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b px-6">
          <p className="text-sm text-muted-foreground">{organization.legalName}</p>
          <UserMenu userName={profile.name} />
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
```

Create `src/app/(app)/page.tsx`:

```tsx
import { redirect } from 'next/navigation';

export default function AppIndexPage() {
  redirect('/dashboard');
}
```

Create `src/components/layout/sidebar.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/accounts', label: 'Accounts' },
  { href: '/journal', label: 'Journal' },
  { href: '/imports', label: 'Imports' },
  { href: '/reports/trial-balance', label: 'Reports' },
];

export function Sidebar({ organizationName }: { organizationName: string }) {
  const pathname = usePathname();

  return (
    <aside className="flex w-56 flex-col border-r bg-muted/30 p-4">
      <p className="mb-6 px-2 text-sm font-semibold">{organizationName}</p>
      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const active =
            item.href === '/reports/trial-balance'
              ? pathname.startsWith('/reports')
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted',
                active ? 'bg-muted font-medium' : 'text-muted-foreground',
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
```

Create `src/components/layout/user-menu.tsx`:

```tsx
'use client';

import { logout } from '@/server/actions/auth-actions';
import { Button } from '@/components/ui/button';

export function UserMenu({ userName }: { userName: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm">{userName}</span>
      <Button variant="outline" size="sm" onClick={() => logout()}>
        Sign out
      </Button>
    </div>
  );
}
```

- [ ] **Step 10: Replace the root page with an auth-aware redirect**

Modify: `src/app/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/server/supabase/server';

export default async function RootPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  redirect(user ? '/dashboard' : '/login');
}
```

- [ ] **Step 11: Write the dashboard**

Create `src/app/(app)/dashboard/page.tsx`:

```tsx
import Link from 'next/link';
import { requireOrganization } from '@/server/auth';
import { createClient } from '@/server/supabase/server';
import { add, toDecimal } from '@/lib/money';
import { formatBusinessDate, formatPHP } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default async function DashboardPage() {
  const { organization } = await requireOrganization();
  const supabase = await createClient();

  const { data: period } = await supabase
    .from('fiscal_period')
    .select('*')
    .eq('organization_id', organization.id)
    .eq('status', 'OPEN')
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: entries } = await supabase
    .from('journal_entry')
    .select('status, total_debit, total_credit')
    .eq('organization_id', organization.id);

  const draftCount = entries?.filter((e) => e.status === 'DRAFT').length ?? 0;
  const postedCount = entries?.filter((e) => e.status === 'POSTED').length ?? 0;
  const totalDebit =
    entries?.reduce((sum, e) => add(sum, e.total_debit), toDecimal('0')) ?? toDecimal('0');
  const totalCredit =
    entries?.reduce((sum, e) => add(sum, e.total_credit), toDecimal('0')) ?? toDecimal('0');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        {period ? (
          <p className="text-sm text-muted-foreground">
            {period.name} · {formatBusinessDate(period.startDate)} –{' '}
            {formatBusinessDate(period.endDate)}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">No open fiscal period.</p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Draft entries
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{draftCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Posted entries
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{postedCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total debits (posted)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{formatPHP(totalDebit)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total credits (posted)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{formatPHP(totalCredit)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-2">
        <Button asChild>
          <Link href="/journal/new">New Journal Entry</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/imports">Import Excel</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/reports/trial-balance">View Trial Balance</Link>
        </Button>
      </div>
    </div>
  );
}
```

Note: `period.startDate`/`period.endDate` — check the generated `Database` type; if the generator emits camelCase row types, these property names are correct; otherwise adjust to the snake_case names the generator produced.

- [ ] **Step 12: Create `.env` files and verify the app runs**

Create `.env.example` (committed):

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-from-supabase-start
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-from-supabase-start
```

Create `.env` locally (gitignored — copy from `.env.example` and paste the keys printed by `npx supabase start`).

Run: `npm run typecheck; npm run lint; npm run build`
Expected: all pass. Then `npm run dev` and verify:

- `http://localhost:3000/` redirects to `/login`.
- Sign in with `accountant@v0.local` / `demo-pass-123` → lands on `/dashboard` showing **V0 Accounting Demo** and zero counts.
- Sign out returns to `/login`.
- Visiting `/dashboard` while signed out redirects to `/login`.

- [ ] **Step 13: Commit**

```bash
git add .
git commit -m "feat: add supabase clients, auth flow, and app shell"
```

---

### Task 9: Playwright setup + auth end-to-end tests

**Files:**

- Create: `playwright.config.ts`, `e2e/support/helpers.ts`, `e2e/auth.spec.ts`
- Modify: `package.json` (e2e scripts), `.gitignore`

**Interfaces:**

- Consumes: seeded accountant (Task 7), login flow (Task 8).
- Produces: `e2e/support/helpers.ts` exporting `TEST_ACCOUNT = { email: 'accountant@v0.local', password: 'demo-pass-123' }` and `signIn(page)`; `npm run test:e2e` script. Prerequisite documented in README (Task 11): local Supabase running with seed applied.

- [ ] **Step 1: Write the Playwright config**

Create `playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: true,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
```

- [ ] **Step 2: Write the helper**

Create `e2e/support/helpers.ts`:

```ts
import { expect, type Page } from '@playwright/test';

export const TEST_ACCOUNT = {
  email: 'accountant@v0.local',
  password: 'demo-pass-123',
};

export async function signIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(TEST_ACCOUNT.email);
  await page.getByLabel('Password').fill(TEST_ACCOUNT.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}
```

- [ ] **Step 3: Write the auth spec**

Create `e2e/auth.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { signIn, TEST_ACCOUNT } from './support/helpers';

test.describe('authentication', () => {
  test('redirects unauthenticated users to /login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });

  test('signs in with the seeded accountant and reaches the dashboard', async ({ page }) => {
    await signIn(page);
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });

  test('shows a generic error for invalid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(TEST_ACCOUNT.email);
    await page.getByLabel('Password').fill('wrong-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toHaveText('Invalid email or password.');
  });

  test('signs out back to /login', async ({ page }) => {
    await signIn(page);
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login/);
  });
});
```

- [ ] **Step 4: Install the browser and add scripts**

```bash
npx playwright install chromium
```

Modify: `package.json` scripts:

```json
"test:e2e": "playwright test"
```

- [ ] **Step 5: Run the tests**

Prerequisite: `npx supabase start` running with seed applied (`npx supabase db reset`).

```bash
npm run test:e2e
```

Expected: 4 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "test: add auth end-to-end tests"
```

---

### Task 10: RLS cross-organization isolation tests (integration)

**Files:**

- Create: `tests/integration/rls/rls.test.ts`, `.env.test.example` (documented in Task 11 as part of README; committed copy `.env.test.example`)

**Interfaces:**

- Consumes: full Phase 1 schema + RLS (Tasks 5–7), local Supabase stack, service-role key + anon key.
- Produces: the Phase 1 acceptance test — proves users cannot read or modify records outside their organization. Skips cleanly when `.env.test` is missing (so `npm test` passes without a database).

- [ ] **Step 1: Write the integration test**

Create `tests/integration/rls/rls.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const available = Boolean(url && serviceRoleKey && anonKey);

describe.skipIf(!available)('RLS cross-organization isolation', () => {
  const emailA = `rls-a-${Date.now()}@v0.test`;
  const emailB = `rls-b-${Date.now()}@v0.test`;
  const password = 'test-pass-123';

  let admin: SupabaseClient<Database>;
  let userIdA = '';
  let userIdB = '';
  let orgIdA = '';
  let orgIdB = '';

  beforeAll(async () => {
    admin = createClient<Database>(url!, serviceRoleKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userA } = await admin.auth.admin.createUser({
      email: emailA,
      password,
      email_confirm: true,
    });
    const { data: userB } = await admin.auth.admin.createUser({
      email: emailB,
      password,
      email_confirm: true,
    });
    userIdA = userA!.user.id;
    userIdB = userB!.user.id;

    await admin.from('profile').insert([
      { id: userIdA, name: 'RLS User A' },
      { id: userIdB, name: 'RLS User B' },
    ]);

    const { data: orgA } = await admin
      .from('organization')
      .insert({ name: 'Org A', legal_name: 'Org A' })
      .select('id')
      .single();
    const { data: orgB } = await admin
      .from('organization')
      .insert({ name: 'Org B', legal_name: 'Org B' })
      .select('id')
      .single();
    orgIdA = orgA!.id;
    orgIdB = orgB!.id;

    await admin.from('organization_membership').insert([
      { organization_id: orgIdA, user_id: userIdA, role: 'ACCOUNTANT' },
      { organization_id: orgIdB, user_id: userIdB, role: 'ACCOUNTANT' },
    ]);

    await admin.from('account').insert([
      {
        organization_id: orgIdA,
        code: '1000',
        name: 'Org A Cash',
        type: 'ASSET',
        normal_balance: 'DEBIT',
      },
      {
        organization_id: orgIdB,
        code: '1000',
        name: 'Org B Cash',
        type: 'ASSET',
        normal_balance: 'DEBIT',
      },
    ]);
  });

  afterAll(async () => {
    if (!available) return;
    await admin.from('account').delete().in('organization_id', [orgIdA, orgIdB]);
    await admin.from('organization_membership').delete().in('organization_id', [orgIdA, orgIdB]);
    await admin.from('organization').delete().in('id', [orgIdA, orgIdB]);
    await admin.auth.admin.deleteUser(userIdA);
    await admin.auth.admin.deleteUser(userIdB);
  });

  async function signInAs(email: string) {
    const client = createClient<Database>(url!, anonKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await client.auth.signInWithPassword({ email, password });
    expect(error).toBeNull();
    return client;
  }

  it('lets a member read only their own organization records', async () => {
    const client = await signInAs(emailA);

    const { data: accounts } = await client.from('account').select('id, code');
    expect(accounts).toEqual([expect.objectContaining({ code: '1000', name: 'Org A Cash' })]);

    const { data: orgs } = await client.from('organization').select('id');
    expect(orgs).toEqual([expect.objectContaining({ id: orgIdA })]);
  });

  it('denies reading another organization record by id', async () => {
    const client = await signInAs(emailA);

    const { data, error } = await client
      .from('account')
      .select('id')
      .eq('id', orgIdA)
      .maybeSingle();
    void error;

    const { data: crossOrg } = await client
      .from('account')
      .select('*')
      .in('organization_id', [orgIdB]);
    expect(crossOrg).toEqual([]);
    void data;
  });

  it('denies inserting into another organization', async () => {
    const client = await signInAs(emailA);

    const { error } = await client.from('account').insert({
      organization_id: orgIdB,
      code: '9999',
      name: 'Sneaky Account',
      type: 'ASSET',
      normal_balance: 'DEBIT',
    });

    expect(error).not.toBeNull();
    const { data: check } = await admin
      .from('account')
      .select('id')
      .eq('organization_id', orgIdB)
      .eq('code', '9999');
    expect(check).toEqual([]);
  });

  it('denies updating another organization record', async () => {
    const client = await signInAs(emailA);

    const { error } = await client
      .from('account')
      .update({ name: 'Hacked' })
      .eq('organization_id', orgIdB);

    expect(error).not.toBeNull();
  });

  it('restricts profile access to the owner', async () => {
    const client = await signInAs(emailA);

    const { data: own } = await client.from('profile').select('id').eq('id', userIdA);
    expect(own).toEqual([expect.objectContaining({ id: userIdA })]);

    const { data: other } = await client.from('profile').select('id').eq('id', userIdB);
    expect(other).toEqual([]);
  });
});
```

Note: the RLS integration test expects `account` rows to include `name` in `select('id, code')` results — the second line of the first test selects `id, code` only; adjust the expectation to match exactly the selected columns if the assertion fails (keep `code` and assert `length === 1`).

- [ ] **Step 2: Create the test env template and local env**

Create `.env.test.example` (committed):

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-from-supabase-start
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-from-supabase-start
```

Create `.env.test` locally (gitignored): copy the template, fill in the keys from `npx supabase start`.

- [ ] **Step 3: Run the full test suite**

Prerequisite: local Supabase running.

```bash
npm test
```

Expected: unit tests (12) PASS; RLS integration tests PASS (6).

- [ ] **Step 4: Confirm the suite passes without a database**

Temporarily rename `.env.test` to `.env.test.bak` and run:

```bash
npm test
```

Expected: unit tests PASS; RLS tests are skipped (not failed). Restore `.env.test`.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "test: verify RLS cross-organization isolation"
```

---

### Task 11: README, Dockerfile, and project polish

**Files:**

- Create: `README.md`, `Dockerfile`, `.dockerignore`
- Modify: `next.config.ts` (standalone output), `.gitignore`

**Interfaces:**

- Consumes: everything from Tasks 1–10.
- Produces: the Phase 1 deliverable set: README with setup/migration/seed/test/deploy commands, Dockerfile for managed hosting, `.env.example`, `.env.test.example`.

- [ ] **Step 1: Configure standalone output**

Modify: `next.config.ts`:

```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
};

export default nextConfig;
```

- [ ] **Step 2: Write the Dockerfile**

Create `Dockerfile`:

```dockerfile
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
```

Create `.dockerignore`:

```
node_modules
.next
.env*
.git
docs
tests
e2e
playwright-report
```

- [ ] **Step 3: Update `.gitignore`**

Read `.gitignore` and ensure these entries exist (create-next-app provides most; add any missing):

```
.env
.env.test
.env.local
supabase/.branches
supabase/.temp
playwright-report
test-results
```

- [ ] **Step 4: Write the README**

Create `README.md`:

````markdown
# ERP V0 — Accounting Prototype

Single-company accounting prototype: journal entries, posting, reversal, and the five core financial reports, built with Next.js + Supabase. See `docs/superpowers/specs/2026-08-19-erp-v0-design.md` for the full specification.

## Prerequisites

- Node.js >= 20
- Docker Desktop (for the local Supabase stack)
- Git

## Local setup

```bash
npm install
npx supabase start          # starts local Postgres + Auth (first run downloads images)
npx supabase db reset       # applies migrations and seed data
```

Copy the keys printed by `supabase start` into `.env` (template: `.env.example`):

```bash
cp .env.example .env
```

Run the app:

```bash
npm run dev
```

Sign in with the seeded accountant:

- Email: `accountant@v0.local`
- Password: `demo-pass-123`

## Database commands

```bash
npx supabase db reset                  # re-apply all migrations + seed
npx supabase gen types typescript --local --output src/types/database.ts
npx supabase stop                      # stop the local stack
```

## Tests

```bash
npm test                               # unit + integration (RLS tests need the local stack + .env.test)
npm run test:e2e                       # Playwright (needs local stack + seed, and npm run dev or the built app)
```

Copy `.env.test.example` to `.env.test` and fill in the Supabase keys for the RLS integration tests.

## Lint, types, and build

```bash
npm run lint
npm run typecheck
npm run build
```

## Deployment

The app is a standard Next.js standalone build; a `Dockerfile` is included:

```bash
docker build -t erp-v0 .
docker run -p 3000:3000 -e NEXT_PUBLIC_SUPABASE_URL=... -e NEXT_PUBLIC_SUPABASE_ANON_KEY=... erp-v0
```

For managed hosting, connect the repository to your provider and set the environment variables from a hosted Supabase project (apply migrations with `supabase db push` after linking with `supabase link`).

## Security notes

- The service-role key (`SUPABASE_SERVICE_ROLE_KEY`) is server-only. It must never be exposed to the browser — do not prefix it with `NEXT_PUBLIC_`.
- All organization-owned tables are protected by PostgreSQL Row-Level Security; the application additionally checks organization membership on every request.
- Secrets are never committed. Only `.env.example` and `.env.test.example` are tracked.

## Known limitations (Phase 1)

- Local Supabase stack only; no hosted deployment yet.
- Accounts, journal entries, imports, and reports are not yet implemented (Phases 2–5).
- Single visible organization (schema is multi-org ready via `organization_id` + RLS).
````

- [ ] **Step 5: Final lint/type/build pass**

```bash
npm run lint; npm run typecheck; npm run build
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "docs: add README, Dockerfile, and env templates"
```

---

### Task 12: Phase 1 verification pass

**Files:**

- None (verification only).

- [ ] **Step 1: Full test suite**

Prerequisite: local Supabase running with seed applied.

```bash
npm test
npm run test:e2e
```

Expected: 12 unit + 6 RLS integration tests PASS; 4 Playwright tests PASS.

- [ ] **Step 2: Lint, typecheck, build**

```bash
npm run lint
npm run typecheck
npm run build
```

Expected: all exit 0.

- [ ] **Step 3: Manual smoke check**

With `npm run dev` running:

1. `http://localhost:3000/` → redirects to `/login`.
2. Wrong password → "Invalid email or password." (generic message, no stack trace).
3. `accountant@v0.local` / `demo-pass-123` → `/dashboard` showing **V0 Accounting Demo**, "July 2026 Test Period", zero counts.
4. `/dashboard` while signed out → `/login` (via middleware).
5. Sign out → `/login`.

- [ ] **Step 4: Confirm Phase 1 acceptance criteria**

From spec §14 Phase 1 and §13:

- [ ] Next.js + TypeScript strict project runs locally.
- [ ] Tailwind, shadcn/ui, TanStack Table, Supabase SSR clients, Vitest, Playwright configured.
- [ ] Supabase CLI project with versioned migrations 00001–00009 and seed data.
- [ ] `.env.example`, generated database types, README, Dockerfile present.
- [ ] Login works; protected pages redirect unauthenticated users.
- [ ] RLS isolation verified by automated tests (no cross-org reads/writes).

- [ ] **Step 5: Commit any leftover changes**

```bash
git status
git add .
git commit -m "chore: phase 1 verification"
```

---

## Self-review notes

- **Spec coverage (§14 Phase 1):** project init (Task 1), Tailwind/shadcn/TanStack/Supabase SSR/Vitest/Playwright (Tasks 2–4, 8, 9), Supabase CLI + migrations + seed (Tasks 5–7), `.env.example`/types/README (Tasks 8, 11), Auth + Profile + membership + RLS (Tasks 5–8), cross-org verification (Task 10). Dockerfile + `.env.example` deliverables (Task 11).
- **Deferred by design:** RPCs `post_journal_entry`/`reverse_journal_entry` and `00010_sequences.sql` are Phase 3 (posting). Import templates and ExcelJS are Phase 5. Accounts CRUD UI and COA seed accounts are Phase 2.
- **Placeholder scan:** no TBD/TODO; every code step carries real code.
- **Type consistency:** `toDecimal`/`add`/`sub`/`isZero`/`isPositive`/`isNegative`/`isBalanced`/`toDbString`/`MONEY_SCALE` from Task 4 are the only money entry points used in Tasks 8/10; `requireOrganization()`/`requireOrganizationAction()`/`requireSession()`/`getOrganizationContext()` from Task 8 are the only auth entry points; `login`/`logout`/`LoginState` from Task 8 are used by Task 9.
- **Known environment adjustment:** Task 10's `account` select returns only selected columns; the expectation line may need a column-list tweak noted inline at the test.
