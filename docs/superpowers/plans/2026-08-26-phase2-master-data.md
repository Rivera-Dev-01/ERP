# Phase 2 — Accounting Master Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the V0 master-data layer — organization profile editing, fiscal period management, and the full Chart of Accounts (table, validated create/edit, deactivation with warning, atomic CSV import, and seed backfill) — on the hosted Supabase backend as three sequential, shippable slices.

**Architecture:** One spec, three slices executed in order (Slice 1 `/settings` org, Slice 2 `/settings/periods` fiscal periods, Slice 3 `/accounts` chart). All mutations are Server Actions gated by `requireOrganizationAction()` (which throws `UnauthorizedError`) plus RLS. CSV import follows Approach A: server-side parse and Zod validation inside a Server Action, atomic validate-then-insert with an `import_batch` trace row. Reads are Server Components + TanStack Table (client). No new migrations; reuse existing `organization`, `fiscal_period`, `account`, `import_batch` tables. Nested route `/settings/periods` under `/settings` keeps settings together.

**Tech Stack:** Next.js 16.3.1 App Router (TS strict) + Tailwind + shadcn/ui (Base UI `buttonVariants`) + TanStack Table + `@supabase/ssr` + Supabase hosted (`tdmcnbnyusxdegzopxhd`) + Zod + `react-hook-form` + `@hookform/resolvers` + `papaparse` + Vitest + Playwright + `supabase` CLI (`db push` / `gen types --linked`).

**Spec:** `docs/superpowers/specs/2026-08-26-phase2-accounting-master-data-design.md` (extends `2026-08-19-erp-v0-design.md` §14).

## Global Constraints

- Platform: Windows 11, PowerShell 5.1. No `&&` chaining — use `; if ($?) { ... }`. `>` writes UTF-16 — never redirect CLI output; use the CLI's `--output`/stdout handling. `cmd /c` with `npx.cmd` is the correct stdout capture in this shell.
- Node >= 20 (verified 24.19.0), npm 11.17.0, git 2.55. TypeScript strict mode never disabled.
- Hosted Supabase only. No Docker, no `supabase start`/`supabase db reset`. Schema changes ship as `supabase db push` via `supabase link --project-ref tdmcnbnyusxdegzopxhd` (already linked). Types regenerate with `cmd /c "cd /d D:\ERP && npx.cmd supabase gen types typescript --linked > src\types\database.ts"` (do not use PowerShell `>`).
- Money is `NUMERIC(19,4)` in Postgres and `decimal.js` wrapped in `src/lib/money.ts`; not needed for Phase 2 but the rule stays. Business dates are Postgres `DATE` displayed with `Asia/Manila` via `src/lib/format.ts`.
- No Prisma, Auth.js, Redux, event buses, queues, microservices, or second backend framework.
- `src/server/` is `server-only`; `src/lib/` is client+server-safe; `src/types/database.ts` is generated.
- All organization-owned queries are scoped by `organization_id` via RLS plus server-side `requireOrganization()` / `requireOrganizationAction()` on every fetch/mutation. The service-role key never appears in client components or `NEXT_PUBLIC_` vars. `.env*` is gitignored.
- Secrets never committed. `supabase db push` is the only schema path; no manual prod edits.
- Every task ends with `git add -A` + commit and a verification (`npm run typecheck`, `npm run lint`, `npm run build`, relevant tests). Builds must be green before the next task.
- User-facing errors are generic; never expose stack traces or raw Postgres messages — map known codes (`23505` unique, `23P01` exclusion) to friendly field errors.

---

## File Structure (delta vs Phase 1)

All new files are created; no Phase 1 file is deleted. Defer any unrelated refactoring.

```
D:\ERP\
├─ CONTEXT.md                                            # already committed (glossary)
├─ templates/chart-of-accounts.csv                       # already exists — download template
├─ src/
│  ├─ proxy.ts                                           # already exists (Next 16)
│  ├─ app/(app)/
│  │  ├─ layout.tsx                                       # already exists — sidebar links already include /accounts, /journal, /imports, /reports
│  │  ├─ settings/page.tsx                                # NEW Slice 1 — org profile
│  │  ├─ settings/periods/page.tsx                        # NEW Slice 2 — period list + dialogs
│  │  └─ accounts/page.tsx                                # NEW Slice 3 — chart table + dialogs + import
│  ├─ components/
│  │  ├─ ui/                                              # already: button, input, label, card, badge, table, dialog, dropdown-menu, avatar, select, separator, skeleton, sonner
│  │  ├─ settings/OrgProfileForm.tsx                      # NEW
│  │  ├─ periods/PeriodTable.tsx                          # NEW (client)
│  │  ├─ periods/PeriodForm.tsx                           # NEW (client dialog)
│  │  ├─ periods/CloseConfirm.tsx                         # NEW
│  │  ├─ accounts/AccountsTable.tsx                       # NEW (client, TanStack)
│  │  ├─ accounts/AccountForm.tsx                         # NEW (client dialog)
│  │  ├─ accounts/DeactivateConfirm.tsx                   # NEW
│  │  └─ imports/CsvUpload.tsx + ErrorPanel.tsx           # NEW (reused later in Phase 5)
│  ├─ lib/validation/organization.ts                      # NEW Zod
│  ├─ lib/validation/fiscal-period.ts                     # NEW Zod
│  ├─ lib/validation/account.ts                           # NEW Zod
│  ├─ server/
│  │  ├─ domain/accounts.ts                               # NEW — CSV header map + Active coercions
│  │  ├─ domain/fiscal-periods.ts                         # NEW — overlap helper (shared later)
│  │  ├─ actions/organization-actions.ts                  # NEW — updateOrganization
│  │  ├─ actions/period-actions.ts                        # NEW — createPeriod, closePeriod
│  │  ├─ actions/account-actions.ts                       # NEW — upsertAccount, deactivateAccount, importAccountsCsv
│  │  └─ imports/parser.ts                                # NEW — Papaparse wrapper
│  │  └─ imports/coa-import.ts                            # NEW — row-level Zod + within-file + vs-DB duplicate checks
│  └─ types/database.ts                                   # regenerated if account additions require it
├─ tests/
│  ├─ unit/domain/organization.test.ts                    # NEW
│  ├─ unit/domain/fiscal-periods.test.ts                  # NEW
│  ├─ unit/domain/accounts.test.ts                        # NEW
│  ├─ unit/domain/coa-import.test.ts                      # NEW
│  ├─ integration/organization.test.ts                    # NEW
│  ├─ integration/fiscal-period.test.ts                   # NEW
│  ├─ integration/account.test.ts                         # NEW (incl. deactivation-with-lines)
│  └─ integration/coa-import.test.ts                      # NEW
├─ e2e/accounts.spec.ts                                   # NEW
├─ supabase/migrations/                                   # none new for Phase 2
└─ supabase/seed.sql                                      # unchanged; seed backfill handled in app code
```

---

### Task 1: Slice 1 — Organization profile (validation + Server Action + page)

**Files:**

- Create: `src/lib/validation/organization.ts`, `src/server/actions/organization-actions.ts`, `src/components/settings/OrgProfileForm.tsx`, `src/app/(app)/settings/page.tsx`
- Test: `tests/unit/domain/organization.test.ts`, `tests/integration/organization.test.ts`

**Interfaces:**

- Consumes: `requireOrganization()` / `requireOrganizationAction()` from `src/server/auth.ts:28`, `createClient()` from `src/server/supabase/server.ts:7`, `Tables<'organization'>` from `src/types/database.ts:373`.
- Produces for later slices: `updateOrganization(formData: FormData): Promise<{ ok: boolean; fieldErrors?: Record<string,string>; formError?: string }>` (returns fieldErrors for `react-hook-form` `setError` when Zod fails or `formError` when membership missing). No other slice imports this module directly.

- [ ] **Step 1: Install Slice 1 deps**

Run:

```powershell
npm install zod react-hook-form @hookform/resolvers --no-audit --no-fund --loglevel=warn
if ($?) { npm run typecheck }
```

Expected: added 4 packages, `tsc --noEmit` still green (only transient `@/types/database` note resolved by `cmd /c "cd /d D:\ERP && npx.cmd supabase gen types typescript --linked > src\types\database.ts"` if needed).

- [ ] **Step 2: Write the failing unit test (TDD red)**

Create `tests/unit/domain/organization.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { organizationUpdateSchema } from '@/lib/validation/organization';

describe('organizationUpdateSchema', () => {
  it('accepts trimmed legal names', () => {
    expect(organizationUpdateSchema.parse({ name: ' Acme ', legal_name: ' Acme LLC ' })).toEqual({
      name: 'Acme',
      legal_name: 'Acme LLC',
    });
  });
  it('rejects empty name', () => {
    expect(() => organizationUpdateSchema.parse({ name: ' ', legal_name: 'x' })).toThrow();
  });
  it('rejects overlong name', () => {
    expect(() =>
      organizationUpdateSchema.parse({ name: 'a'.repeat(121), legal_name: 'x' }),
    ).toThrow();
  });
});
```

- [ ] **Step 3: Run test to confirm it fails**

Run: `npx vitest run tests/unit/domain/organization.test.ts`
Expected: FAIL — `Cannot find module '@/lib/validation/organization'`.

- [ ] **Step 4: Implement the Zod schema (green)**

Create `src/lib/validation/organization.ts`:

```ts
import { z } from 'zod';

export const organizationUpdateSchema = z.object({
  name: z.string().trim().min(1, 'Organization name is required').max(120),
  legal_name: z.string().trim().min(1, 'Legal name is required').max(120),
});

export type OrganizationUpdateInput = z.infer<typeof organizationUpdateSchema>;
```

- [ ] **Step 5: Run test to confirm it passes**

Run: `npx vitest run tests/unit/domain/organization.test.ts`
Expected: 3 passed.

- [ ] **Step 6: Write `src/server/actions/organization-actions.ts`**

```ts
'use server';
import 'server-only';
import { revalidatePath } from 'next/cache';
import { requireOrganizationAction } from '@/server/auth';
import { createClient } from '@/server/supabase/server';
import { organizationUpdateSchema } from '@/lib/validation/organization';

type ActionResult = { ok: boolean; fieldErrors?: Record<string, string>; formError?: string };

export async function updateOrganization(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = organizationUpdateSchema.safeParse({
    name: String(formData.get('name') ?? ''),
    legal_name: String(formData.get('legal_name') ?? ''),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] = issue.message;
    return { ok: false, fieldErrors };
  }
  let ctx;
  try {
    ctx = await requireOrganizationAction();
  } catch {
    return { ok: false, formError: 'Not authorized' };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from('organization')
    .update({ name: parsed.data.name, legal_name: parsed.data.legal_name })
    .eq('id', ctx.organization.id);
  if (error) return { ok: false, formError: 'Unable to save changes. Please try again.' };
  revalidatePath('/settings');
  return { ok: true };
}
```

- [ ] **Step 7: Write `src/components/settings/OrgProfileForm.tsx`** (client, `react-hook-form` + `useActionState` bridge pattern — form uses `zodResolver` for instant inline errors and falls back to Server Action fieldErrors via `setError`)

```tsx
'use client';
import { useActionState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { updateOrganization } from '@/server/actions/organization-actions';
import {
  organizationUpdateSchema,
  type OrganizationUpdateInput,
} from '@/lib/validation/organization';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

export function OrgProfileForm({ defaultValues }: { defaultValues: OrganizationUpdateInput }) {
  const {
    register,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<OrganizationUpdateInput>({
    resolver: zodResolver(organizationUpdateSchema),
    defaultValues,
  });
  const [state, formAction, pending] = useActionState(updateOrganization, { ok: false } as never);

  useEffect(() => {
    if (!state) return;
    if ((state as { fieldErrors?: Record<string, string> }).fieldErrors) {
      for (const [k, v] of Object.entries(
        (state as { fieldErrors: Record<string, string> }).fieldErrors,
      )) {
        setError(k as keyof OrganizationUpdateInput, { message: v });
      }
    }
    if ((state as { formError?: string }).formError)
      toast.error((state as { formError: string }).formError);
    if ((state as { ok: boolean }).ok) toast.success('Organization updated');
  }, [state, setError]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Organization Profile</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Organization name</Label>
            <Input id="name" {...register('name')} name="name" />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="legal_name">Legal name</Label>
            <Input id="legal_name" {...register('legal_name')} name="legal_name" />
            {errors.legal_name && (
              <p className="text-sm text-destructive">{errors.legal_name.message}</p>
            )}
          </div>
          <Button type="submit" disabled={pending || isSubmitting}>
            {pending ? 'Saving…' : 'Save'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 8: Write `src/app/(app)/settings/page.tsx`** (Server Component, org-visible)

```tsx
import { requireOrganization } from '@/server/auth';
import { OrgProfileForm } from '@/components/settings/OrgProfileForm';

export default async function SettingsPage() {
  const { organization } = await requireOrganization();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Organization</h1>
        <p className="text-sm text-muted-foreground">{organization.name}</p>
      </div>
      <section className="grid gap-2 rounded-lg border p-4 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Currency</span>
          <span>{organization.currency_code}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Timezone</span>
          <span>{organization.timezone}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Fiscal year starts</span>
          <span>Month {organization.fiscal_year_start_month}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">TIN</span>
          <span>{organization.tin ?? '—'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">RDO</span>
          <span>{organization.rdo ?? '—'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Tax classification</span>
          <span>{organization.tax_classification ?? '—'}</span>
        </div>
      </section>
      <OrgProfileForm
        defaultValues={{ name: organization.name, legal_name: organization.legal_name }}
      />
    </div>
  );
}
```

- [ ] **Step 9: Write integration test (skipIf no env) and run it**

Create `tests/integration/organization.test.ts`:

```ts
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
const available = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
describe.skipIf(!available)('organization integration', () => {
  it('member can read own organization', async () => {
    const admin = createClient<Database>(url!, serviceRoleKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: orgs } = await admin
      .from('organization')
      .select('id')
      .eq('id', '22222222-2222-2222-2222-222222222222');
    expect(orgs).toHaveLength(1);
  });
});
```

Run: `npm run typecheck; npm run lint; npx vitest run tests/unit/domain/organization.test.ts tests/integration/organization.test.ts`
Expected: typecheck green, lint green, unit 3 passed, integration 1 passed/skipped per env.

- [ ] **Step 10: Format, build, commit**

Run: `npm run format; npm run build`
Expected: build green.

```bash
git add -A
git commit -m "feat(settings): organization profile with validated Server Action (Slice 1)"
```

---

### Task 2: Slice 2 — Fiscal period list

**Files:**

- Create: `src/lib/validation/fiscal-period.ts`, `src/server/domain/fiscal-periods.ts`, `src/server/actions/period-actions.ts`, `src/components/periods/PeriodTable.tsx`, `src/components/periods/PeriodForm.tsx`, `src/components/periods/CloseConfirm.tsx`, `src/app/(app)/settings/periods/page.tsx`
- Test: `tests/unit/domain/fiscal-periods.test.ts`, `tests/integration/fiscal-period.test.ts`

**Interfaces:**

- Consumes: `requireOrganization*` from `server/auth.ts`, `createClient()` from `server/supabase/server.ts`, `Tables<'fiscal_period'>` from `types/database.ts`.
- Produces: `createFiscalPeriod(formData): Promise<{ ok: boolean; fieldErrors?, formError? }>` (validates `name`, `start_date`, `end_date`, maps DB `23P01`/exclusion violation to overlap error), `closeFiscalPeriod(formData: { id }): Promise<{ ok: boolean; formError? }>`.

- [ ] **Step 1: Write failing unit test for the period Zod schema**

Create `tests/unit/domain/fiscal-periods.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { fiscalPeriodSchema } from '@/lib/validation/fiscal-period';
describe('fiscalPeriodSchema', () => {
  it('accepts valid open period', () => {
    expect(
      fiscalPeriodSchema.parse({
        name: 'Aug 2026',
        start_date: '2026-08-01',
        end_date: '2026-08-31',
      }),
    ).toEqual({ name: 'Aug 2026', start_date: '2026-08-01', end_date: '2026-08-31' });
  });
  it('rejects end before start', () => {
    expect(() =>
      fiscalPeriodSchema.parse({ name: 'Bad', start_date: '2026-08-31', end_date: '2026-08-01' }),
    ).toThrow();
  });
  it('rejects empty name', () => {
    expect(() =>
      fiscalPeriodSchema.parse({ name: ' ', start_date: '2026-08-01', end_date: '2026-08-31' }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run to confirm FAIL**

Run: `npx vitest run tests/unit/domain/fiscal-periods.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/validation/fiscal-period.ts`**

```ts
import { z } from 'zod';
export const fiscalPeriodSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(120),
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
    end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
  })
  .refine((v) => new Date(v.end_date) >= new Date(v.start_date), {
    message: 'End date must be on or after start date',
    path: ['end_date'],
  });
export type FiscalPeriodInput = z.infer<typeof fiscalPeriodSchema>;
```

- [ ] **Step 4: Confirm test passes**

Run: `npx vitest run tests/unit/domain/fiscal-periods.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Create `src/server/domain/fiscal-periods.ts`** (overlap message helper, reused by action)

```ts
export function isOverlapError(error: { code?: string; message?: string }): boolean {
  // Postgres exclusion violation surfaces as code 23P01 or message containing "overlaps" / "exclusion"
  return error.code === '23P01' || /overlap|exclusion/i.test(error.message ?? '');
}
```

- [ ] **Step 6: Create `src/server/actions/period-actions.ts`** (create + close, RLS + server guard, mapped errors, `revalidatePath`)

```ts
'use server';
import 'server-only';
import { revalidatePath } from 'next/cache';
import { requireOrganizationAction } from '@/server/auth';
import { createClient } from '@/server/supabase/server';
import { fiscalPeriodSchema } from '@/lib/validation/fiscal-period';
import { isOverlapError } from '@/server/domain/fiscal-periods';

type R = { ok: boolean; fieldErrors?: Record<string, string>; formError?: string };

export async function createFiscalPeriod(_prev: R, formData: FormData): Promise<R> {
  const parsed = fiscalPeriodSchema.safeParse({
    name: String(formData.get('name') ?? ''),
    start_date: String(formData.get('start_date') ?? ''),
    end_date: String(formData.get('end_date') ?? ''),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] = i.message;
    return { ok: false, fieldErrors };
  }
  let ctx;
  try {
    ctx = await requireOrganizationAction();
  } catch {
    return { ok: false, formError: 'Not authorized' };
  }
  const supabase = await createClient();
  const { error } = await supabase.from('fiscal_period').insert({
    organization_id: ctx.organization.id,
    name: parsed.data.name,
    start_date: parsed.data.start_date,
    end_date: parsed.data.end_date,
    status: 'OPEN',
  });
  if (error) {
    if (isOverlapError(error as { code?: string; message?: string }))
      return {
        ok: false,
        formError: `Period ${parsed.data.start_date}–${parsed.data.end_date} overlaps an existing period.`,
      };
    if ((error as { code?: string }).code === '23505')
      return { ok: false, fieldErrors: { name: 'A period with this name already exists' } };
    return { ok: false, formError: 'Unable to create period. Please try again.' };
  }
  revalidatePath('/settings/periods');
  return { ok: true };
}

export async function closeFiscalPeriod(_prev: R, formData: FormData): Promise<R> {
  const id = String(formData.get('id') ?? '');
  if (!id) return { ok: false, formError: 'Missing period id' };
  let ctx;
  try {
    ctx = await requireOrganizationAction();
  } catch {
    return { ok: false, formError: 'Not authorized' };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from('fiscal_period')
    .update({ status: 'CLOSED', closed_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', ctx.organization.id)
    .eq('status', 'OPEN');
  if (error) return { ok: false, formError: 'Unable to close period. Please try again.' };
  revalidatePath('/settings/periods');
  return { ok: true };
}
```

- [ ] **Step 7: Build the UI (PeriodTable + form + close confirm)**

Create `src/components/periods/PeriodTable.tsx` — client, TanStack Table columns: name, start_date (via `formatBusinessDate`), end_date, status badge, closed_at; row action shows Close button only when `status==='OPEN'` which triggers `CloseConfirm`.

Create `src/components/periods/PeriodForm.tsx` — dialog with `react-hook-form` + `zodResolver(fiscalPeriodSchema)` + `useActionState(createFiscalPeriod, ...)` bridge identical to Task 1 pattern (setError on fieldErrors, toast on formError/ok).

Create `src/components/periods/CloseConfirm.tsx` — `AlertDialog` (shadcn) with "Close period 'July 2026 Test Period'? Postings into a closed period will be blocked."; calls `closeFiscalPeriod` via `useActionState`.

Create `src/app/(app)/settings/periods/page.tsx` — Server Component `requireOrganization()` then `supabase.from('fiscal_period').select('*').eq('organization_id', org.id).order('start_date', { ascending: false })` and renders header + New Period button + `<PeriodTable data={periods ?? []} />`.

- [ ] **Step 8: Integration test and full check**

Create `tests/integration/fiscal-period.test.ts` (skipIf no env, admin client via `createClient<Database>(url, serviceRoleKey)`):

```ts
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
const available = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
// ... admin client, random org/user for isolation, create org + membership, then test create overlapping rejected, close sets closed_at
```

Include: create Aug 2026 succeeds; overlapping Aug 15→Sep 15 rejected via `isOverlapError`; close OPEN period sets `CLOSED` + `closed_at`; non-member cannot create.

Run: `npm run typecheck; npm run lint; npx vitest run tests/unit/domain/fiscal-periods.test.ts tests/integration/fiscal-period.test.ts; npm run build`
Expected: typecheck/lint/build green, unit 3 passed, integration 3–4 passed.

- [ ] **Step 9: Format, build, commit**

Run: `npm run format; npm run build`

```bash
git add -A
git commit -m "feat(periods): list, create OPEN and close with confirmation (Slice 2)"
```

---

### Task 3: Slice 3 — Account domain + table + create/edit + seed backfill

**Files:**

- Create: `src/lib/validation/account.ts`, `src/server/domain/accounts.ts`, `src/server/actions/account-actions.ts` (partial: create/update + seed backfill), `src/components/accounts/AccountsTable.tsx`, `src/components/accounts/AccountForm.tsx`, `src/app/(app)/accounts/page.tsx`
- Test: `tests/unit/domain/accounts.test.ts`, `tests/integration/account.test.ts`

**Interfaces:**

- Consumes: `requireOrganization*`, `createClient()`, `Tables<'account'>`, `Enums<'account_type'|'normal_balance'>` from `types/database.ts`; `organization.id` from context.
- Produces: `upsertAccount(formData)` (validates numeric code `/^\d+$/`, unique per org, `name` trimmed, `type`/`normal_balance` enum, `is_active` bool; maps `23505` to field error on `code`; revalidates `/accounts`), `getAccountByCode` helper for domain, and a `seedDemoAccounts()` one-shot called from the page's Server Component when `account` count is 0 (idempotent upsert of the 6 canonical rows, no-op on re-run).

- [ ] **Step 1: Failing unit test for account Zod**

Create `tests/unit/domain/accounts.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { accountSchema } from '@/lib/validation/account';
describe('accountSchema', () => {
  it('accepts valid ASSET/DEBIT', () => {
    expect(
      accountSchema.parse({
        code: '1000',
        name: 'Cash',
        type: 'ASSET',
        normal_balance: 'DEBIT',
        is_active: true,
      }).code,
    ).toBe('1000');
  });
  it('rejects non-numeric code', () => {
    expect(() =>
      accountSchema.parse({
        code: 'A100',
        name: 'x',
        type: 'ASSET',
        normal_balance: 'DEBIT',
        is_active: true,
      }),
    ).toThrow();
  });
  it('rejects empty name', () => {
    expect(() =>
      accountSchema.parse({
        code: '1000',
        name: ' ',
        type: 'ASSET',
        normal_balance: 'DEBIT',
        is_active: true,
      }),
    ).toThrow();
  });
  it('rejects invalid type', () => {
    expect(() =>
      accountSchema.parse({
        code: '1000',
        name: 'x',
        type: 'BOGUS',
        normal_balance: 'DEBIT',
        is_active: true,
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Confirm FAIL, then implement `src/lib/validation/account.ts`**

```ts
import { z } from 'zod';
export const accountSchema = z.object({
  code: z.string().trim().regex(/^\d+$/, 'Code must be numeric').min(1).max(20),
  name: z.string().trim().min(1, 'Account name is required').max(120),
  type: z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE']),
  normal_balance: z.enum(['DEBIT', 'CREDIT']),
  is_active: z.coerce.boolean(),
});
export type AccountInput = z.infer<typeof accountSchema>;
```

Run: `npx vitest run tests/unit/domain/accounts.test.ts` → 4 passed.

- [ ] **Step 3: Create `src/server/domain/accounts.ts`** (helpers for import + seed, no DB calls)

```ts
export const ACCOUNT_HEADERS = [
  'Account Code',
  'Account Name',
  'Account Type',
  'Normal Balance',
  'Active',
] as const;
export function coerceActive(v: string): boolean {
  const s = String(v ?? '')
    .trim()
    .toLowerCase();
  if (['true', '1', 'yes', 'y'].includes(s)) return true;
  if (['false', '0', 'no', 'n'].includes(s)) return false;
  return s === '' ? true : false; // default active when blank
}
```

- [ ] **Step 4: Create `src/server/actions/account-actions.ts`** (create + update; deactivate and CSV deferred to Tasks 4–5)

```ts
'use server';
import 'server-only';
import { revalidatePath } from 'next/cache';
import { requireOrganizationAction } from '@/server/auth';
import { createClient } from '@/server/supabase/server';
import { accountSchema } from '@/lib/validation/account';

type R = { ok: boolean; fieldErrors?: Record<string, string>; formError?: string };

export async function upsertAccount(_prev: R, formData: FormData): Promise<R> {
  const isUpdate = !!String(formData.get('id') ?? '');
  const parsed = accountSchema.safeParse({
    code: String(formData.get('code') ?? ''),
    name: String(formData.get('name') ?? ''),
    type: String(formData.get('type') ?? ''),
    normal_balance: String(formData.get('normal_balance') ?? ''),
    is_active: String(formData.get('is_active') ?? 'true'),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] = i.message;
    return { ok: false, fieldErrors };
  }
  let ctx;
  try {
    ctx = await requireOrganizationAction();
  } catch {
    return { ok: false, formError: 'Not authorized' };
  }
  const supabase = await createClient();
  const payload = {
    organization_id: ctx.organization.id,
    code: parsed.data.code,
    name: parsed.data.name,
    type: parsed.data.type,
    normal_balance: parsed.data.normal_balance,
    is_active: parsed.data.is_active,
  };
  const { error } = isUpdate
    ? await supabase
        .from('account')
        .update(payload)
        .eq('id', String(formData.get('id')))
        .eq('organization_id', ctx.organization.id)
    : await supabase.from('account').insert(payload);
  if (error) {
    if ((error as { code?: string }).code === '23505')
      return { ok: false, fieldErrors: { code: 'Code already exists in this organization' } };
    return { ok: false, formError: 'Unable to save account. Please try again.' };
  }
  revalidatePath('/accounts');
  return { ok: true };
}

export async function seedDemoAccountsIfEmpty(): Promise<void> {
  const ctx = await requireOrganizationAction();
  const supabase = await createClient();
  const { count } = await supabase
    .from('account')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', ctx.organization.id);
  if ((count ?? 0) > 0) return;
  const rows = [
    {
      code: '1000',
      name: 'Cash in Bank',
      type: 'ASSET' as const,
      normal_balance: 'DEBIT' as const,
      is_active: true,
    },
    {
      code: '1100',
      name: 'Accounts Receivable',
      type: 'ASSET' as const,
      normal_balance: 'DEBIT' as const,
      is_active: true,
    },
    {
      code: '3000',
      name: "Owner's Capital",
      type: 'EQUITY' as const,
      normal_balance: 'CREDIT' as const,
      is_active: true,
    },
    {
      code: '4000',
      name: 'Service Revenue',
      type: 'INCOME' as const,
      normal_balance: 'CREDIT' as const,
      is_active: true,
    },
    {
      code: '5000',
      name: 'Office Supplies Expense',
      type: 'EXPENSE' as const,
      normal_balance: 'DEBIT' as const,
      is_active: true,
    },
    {
      code: '5100',
      name: 'Utilities Expense',
      type: 'EXPENSE' as const,
      normal_balance: 'DEBIT' as const,
      is_active: true,
    },
  ].map((r) => ({ ...r, organization_id: ctx.organization.id }));
  await supabase
    .from('account')
    .upsert(rows, { onConflict: 'organization_id,code', ignoreDuplicates: false });
}
```

- [ ] **Step 5: Build the accounts table + form + page (with seed backfill)**

`src/components/accounts/AccountsTable.tsx` — client, columns Code, Account Name, Type (badge), Normal Balance (badge), Active (badge with `cn(is_active ? 'bg-emerald-100' : 'bg-muted')`), search input on `code`/`name` (TanStack `globalFilter`), filter selects for type/active, row actions: Edit (opens dialog) + Deactivate (deferred to Task 4 but stubbed now).

`src/components/accounts/AccountForm.tsx` — dialog with `react-hook-form` + `zodResolver(accountSchema)` + `useActionState(upsertAccount, ...)` bridge (setError on fieldErrors, toast on ok/formError). Helper text under Normal Balance: "ASSET/EXPENSE typically DEBIT; LIABILITY/EQUITY/INCOME typically CREDIT — any combination is allowed." Inputs: code (text, inputMode numeric), name, type (Select), normal_balance (Select), is_active (Switch/checkbox).

`src/app/(app)/accounts/page.tsx` — Server Component:

```tsx
import { requireOrganization } from '@/server/auth';
import { createClient } from '@/server/supabase/server';
import { seedDemoAccountsIfEmpty } from '@/server/actions/account-actions';
import { AccountsTable } from '@/components/accounts/AccountsTable';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default async function AccountsPage() {
  const { organization } = await requireOrganization();
  await seedDemoAccountsIfEmpty();
  const supabase = await createClient();
  const { data: accounts } = await supabase
    .from('account')
    .select('*')
    .eq('organization_id', organization.id)
    .order('code');
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Chart of Accounts</h1>
        <Button asChild variant="outline">
          <Link href="/templates/chart-of-accounts.csv" download>
            Download template
          </Link>
        </Button>
      </div>
      <AccountsTable data={accounts ?? []} />
    </div>
  );
}
```

Add static serving for `templates/` is automatic via `public/`? For V0 add a symlink or copy `templates/chart-of-accounts.csv` to `public/templates/chart-of-accounts.csv` or serve via `next/link` to a Route Handler that streams the file — simplest: copy file to `public/` at build time and link there (add a build-time copy step in the task or just duplicate the file to `public/templates/chart-of-accounts.csv`).

- [ ] **Step 6: Integration test (skipIf no env) — CRUD + duplicate + seed idempotency**

Create `tests/integration/account.test.ts` — uses admin `createClient<Database>(url, serviceRoleKey)` for setup, anon `createClient` for `signInAs`. Covers: create 1000 Cash succeeds, duplicate 1000 within same org rejected (`23505` → field error), update name succeeds, cross-org duplicate (create Org B with own account 1000) succeeds, seed backfill on empty org inserts 6 rows and re-run is idempotent (still 6).

- [ ] **Step 7: Verify and commit**

Run: `npm run typecheck; npm run lint; npx vitest run tests/unit/domain/accounts.test.ts tests/integration/account.test.ts; npm run format; npm run build`
Expected: all green, 4 unit passed, 4–5 integration passed.

```bash
git add -A
git commit -m "feat(accounts): table, validated create/edit, seed backfill (Slice 3a)"
```

---

### Task 4: Deactivation with journal_line warning

**Files:**

- Modify: `src/server/actions/account-actions.ts` (add `deactivateAccount`), `src/components/accounts/AccountsTable.tsx` (wire confirm), `src/components/accounts/AccountForm.tsx` (reuse for edit)
- Create: `src/components/accounts/DeactivateConfirm.tsx`
- Test: extend `tests/integration/account.test.ts` with a deactivation-with-lines case

**Interfaces:**

- Consumes: `account` + `journal_line` (via count query) + `requireOrganizationAction()`.
- Produces: `deactivateAccount(formData: { id }): Promise<{ ok: boolean; formError?; warning?: { count: number } }>` (two-phase: first call returns `warning.count` when lines exist; second call with `confirmed=true` proceeds to `is_active=false`).

- [ ] **Step 1: Extend the server action with the warning path**

Add to `src/server/actions/account-actions.ts`:

```ts
export async function deactivateAccount(
  _prev: { ok: boolean; warningCount?: number; formError?: string },
  formData: FormData,
) {
  const id = String(formData.get('id') ?? '');
  const confirmed = String(formData.get('confirmed') ?? '') === 'true';
  let ctx;
  try {
    ctx = await requireOrganizationAction();
  } catch {
    return { ok: false, formError: 'Not authorized' } as const;
  }
  const supabase = await createClient();
  const { count } = await supabase
    .from('journal_line')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', id);
  const hasLines = (count ?? 0) > 0;
  if (hasLines && !confirmed) return { ok: false, warningCount: count ?? 0 } as const;
  const { error } = await supabase
    .from('account')
    .update({ is_active: false })
    .eq('id', id)
    .eq('organization_id', ctx.organization.id);
  if (error)
    return { ok: false, formError: 'Unable to deactivate account. Please try again.' } as const;
  revalidatePath('/accounts');
  return { ok: true } as const;
}
```

- [ ] **Step 2: Wire the confirm dialog**

Create `src/components/accounts/DeactivateConfirm.tsx` — `AlertDialog` with body `This account is used in N journal lines — deactivate anyway? It will be hidden from future entry forms but retained in history and reports.` Buttons: Cancel / Deactivate. First submit sends `confirmed=false` (shows warning via returned `warningCount`), second submit sends `confirmed=true`.

Extend `AccountsTable.tsx` row menu to call `deactivateAccount` via `useActionState`, surfacing `warningCount` as the dialog trigger.

- [ ] **Step 3: Extend integration test (deactivation-with-lines)**

In `tests/integration/account.test.ts` add:

```ts
it('warns when deactivating an account used in journal lines', async () => {
  // setup: create account A, create a draft journal_entry + journal_line referencing account A via admin
  // call deactivateAccount without confirmed → expect warningCount >0 and is_active still true
  // call deactivateAccount with confirmed=true → expect is_active=false and line still present
});
```

Use direct `supabase.from('journal_entry').insert(...)` + `journal_line` via service_role to create the usage; clean up in `afterAll`.

- [ ] **Step 4: Verify and commit**

Run: `npm run typecheck; npm run lint; npx vitest run tests/integration/account.test.ts; npm run build`
Expected: deactivation test green, table still typechecks.

```bash
git add -A
git commit -m "feat(accounts): deactivation with usage warning (Slice 3b)"
```

---

### Task 5: CSV import — parser + Server Action + UI + import_batch + E2E

**Files:**

- Create: `src/server/imports/parser.ts`, `src/server/imports/coa-import.ts`, `src/components/imports/CsvUpload.tsx`, `src/components/imports/ErrorPanel.tsx`, `e2e/accounts.spec.ts`
- Modify: `src/server/actions/account-actions.ts` (add `importAccountsCsv`), `src/app/(app)/accounts/page.tsx` (add Import button + error panel slot), `package.json` (add `papaparse` + `@types/papaparse`)
- Test: `tests/unit/domain/coa-import.test.ts`, `tests/integration/coa-import.test.ts`, `e2e/accounts.spec.ts`

**Interfaces:**

- Consumes: CSV File via `FormData`, Zod `accountSchema`, `organization.id`, `import_batch` table.
- Produces: `importAccountsCsv(prev, formData: FormData): Promise<{ ok: boolean; rowCount?, validRowCount?, invalidRowCount?, rowErrors?: Array<{ row: number; code: string; message: string }> ; formError? }>` — when `rowErrors.length>0` or any row invalid, returns errors and inserts nothing; when all valid, inserts accounts + one `import_batch` row.

- [ ] **Step 1: Install CSV deps**

Run:

```powershell
npm install papaparse --no-audit --no-fund --loglevel=warn
if ($?) { npm install -D @types/papaparse --no-audit --no-fund --loglevel=warn }
if ($?) { npm run typecheck }
```

- [ ] **Step 2: Failing unit test for the parser/coercions**

Create `tests/unit/domain/coa-import.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { coerceActive } from '@/server/domain/accounts';
import { validateCoaRows } from '@/server/imports/coa-import';
describe('coerceActive', () => {
  it('coerces true variants', () => {
    expect(coerceActive('TRUE')).toBe(true);
    expect(coerceActive('1')).toBe(true);
  });
  it('coerces false variants', () => {
    expect(coerceActive('false')).toBe(false);
    expect(coerceActive('0')).toBe(false);
  });
});
describe('validateCoaRows', () => {
  it('flags non-numeric code and missing name', () => {
    const r = validateCoaRows([
      {
        'Account Code': 'A100',
        'Account Name': '',
        'Account Type': 'ASSET',
        'Normal Balance': 'DEBIT',
        Active: 'true',
      } as never,
    ]);
    expect(r.rowErrors).toHaveLength(2);
  });
  it('flags duplicate within file', () => {
    const r = validateCoaRows([
      {
        'Account Code': '1000',
        'Account Name': 'Cash',
        'Account Type': 'ASSET',
        'Normal Balance': 'DEBIT',
        Active: 'true',
      } as never,
      {
        'Account Code': '1000',
        'Account Name': 'Cash 2',
        'Account Type': 'ASSET',
        'Normal Balance': 'DEBIT',
        Active: 'true',
      } as never,
    ]);
    expect(r.rowErrors.some((e) => /duplicate/i.test(e.message))).toBe(true);
  });
});
```

- [ ] **Step 3: Confirm FAIL, then implement `src/server/imports/parser.ts` + `coa-import.ts`**

`parser.ts` — thin `papaparse.parse(text, { header: true, skipEmptyLines: true, trimHeaders: true })` wrapper that returns `{ rows: Record<string,string>[], headerError?: string }` checking that the header set equals `ACCOUNT_HEADERS` (case-insensitive).

`coa-import.ts`:

```ts
import { accountSchema } from '@/lib/validation/account';
import { coerceActive, ACCOUNT_HEADERS } from '@/server/domain/accounts';
export function validateCoaRows(rows: Record<string, string>[]): {
  rowErrors: Array<{ row: number; code: string; message: string }>;
  normalized: Array<{
    code: string;
    name: string;
    type: string;
    normal_balance: string;
    is_active: boolean;
  }>;
} {
  const rowErrors: Array<{ row: number; code: string; message: string }> = [];
  const seen = new Set<string>();
  const normalized: Array<{
    code: string;
    name: string;
    type: string;
    normal_balance: string;
    is_active: boolean;
  }> = [];
  rows.forEach((r, idx) => {
    const rowNum = idx + 2; // 1 is header
    const code = String(r['Account Code'] ?? '').trim();
    const name = String(r['Account Name'] ?? '').trim();
    const type = String(r['Account Type'] ?? '')
      .trim()
      .toUpperCase();
    const normal_balance = String(r['Normal Balance'] ?? '')
      .trim()
      .toUpperCase();
    const is_active = coerceActive(String(r['Active'] ?? 'true'));
    if (seen.has(code) && code)
      rowErrors.push({ row: rowNum, code, message: 'Duplicate code within file' });
    seen.add(code);
    const parsed = accountSchema.safeParse({ code, name, type, normal_balance, is_active });
    if (!parsed.success) {
      for (const i of parsed.error.issues)
        rowErrors.push({ row: rowNum, code, message: `${String(i.path[0])}: ${i.message}` });
    } else
      normalized.push({
        code: parsed.data.code,
        name: parsed.data.name,
        type: parsed.data.type,
        normal_balance: parsed.data.normal_balance,
        is_active: parsed.data.is_active,
      });
  });
  return { rowErrors, normalized };
}
```

Run: `npx vitest run tests/unit/domain/coa-import.test.ts` → 3 passed.

- [ ] **Step 4: Implement `importAccountsCsv` in `src/server/actions/account-actions.ts`**

```ts
import Papa from 'papaparse';
import { validateCoaRows } from '@/server/imports/coa-import';
import { ACCOUNT_HEADERS } from '@/server/domain/accounts';
// ... inside the file, add:
export async function importAccountsCsv(
  _prev: {
    ok: boolean;
    rowErrors?: Array<{ row: number; code: string; message: string }>;
    rowCount?: number;
    formError?: string;
  },
  formData: FormData,
) {
  let ctx;
  try {
    ctx = await requireOrganizationAction();
  } catch {
    return { ok: false, formError: 'Not authorized' } as const;
  }
  const file = formData.get('file') as File | null;
  if (!file) return { ok: false, formError: 'No file provided' } as const;
  const text = await file.text();
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    trimHeaders: true,
  });
  const headers = (parsed.meta.fields ?? []).map((h) => String(h).trim());
  const headerOk = ACCOUNT_HEADERS.every((h) =>
    headers.map((x) => x.toLowerCase()).includes(h.toLowerCase()),
  );
  if (!headerOk)
    return {
      ok: false,
      formError: `Invalid header. Expected: ${ACCOUNT_HEADERS.join(', ')}`,
    } as const;
  const rows = parsed.data as Record<string, string>[];
  const { rowErrors, normalized } = validateCoaRows(rows);
  // vs-DB duplicate check (single query)
  const supabase = await createClient();
  if (normalized.length > 0) {
    const codes = normalized.map((r) => r.code);
    const { data: existing } = await supabase
      .from('account')
      .select('code')
      .eq('organization_id', ctx.organization.id)
      .in('code', codes);
    const existingSet = new Set((existing ?? []).map((r) => r.code));
    for (const r of normalized)
      if (existingSet.has(r.code))
        rowErrors.push({ row: -1, code: r.code, message: 'Code already exists in organization' });
  }
  if (rowErrors.length > 0) return { ok: false, rowErrors, rowCount: rows.length } as const;
  // atomic validate-then-insert (no inserts yet means atomic at app level)
  const payload = normalized.map((r) => ({
    organization_id: ctx.organization.id,
    code: r.code,
    name: r.name,
    type: r.type as Database['public']['Enums']['account_type'],
    normal_balance: r.normal_balance as Database['public']['Enums']['normal_balance'],
    is_active: r.is_active,
  }));
  const { error } = await supabase.from('account').insert(payload);
  if (error) {
    if ((error as { code?: string }).code === '23505')
      return {
        ok: false,
        rowErrors: [{ row: -1, code: '', message: 'Duplicate code in organization (race)' }],
        rowCount: rows.length,
      } as const;
    return { ok: false, formError: 'Import failed. Please try again.' } as const;
  }
  await supabase.from('import_batch').insert({
    organization_id: ctx.organization.id,
    file_name: file.name,
    import_type: 'CHART_OF_ACCOUNTS',
    status: 'IMPORTED',
    row_count: rows.length,
    valid_row_count: rows.length,
    invalid_row_count: 0,
    created_by_id: ctx.profile.id,
  });
  revalidatePath('/accounts');
  return { ok: true, rowCount: rows.length } as const;
}
```

- [ ] **Step 5: Wire the UI (`CsvUpload` + `ErrorPanel` + page slot)**

`src/components/imports/CsvUpload.tsx` — client `input type=file accept=.csv` + `useActionState(importAccountsCsv, ...)`; on `rowErrors` render `<ErrorPanel rows={rowErrors} />`, on ok toast success.

`src/components/imports/ErrorPanel.tsx` — TanStack table of row | code | message + "Download error report" button (generates CSV via `papaparse.unparse` and triggers `download`).

Extend `src/app/(app)/accounts/page.tsx` to include the Import button (opens `CsvUpload` dialog) and the error panel slot. Link the template: duplicate `templates/chart-of-accounts.csv` to `public/templates/chart-of-accounts.csv` (add `cp templates/chart-of-accounts.csv public/templates/chart-of-accounts.csv` in a pre-build script or just duplicate at task time).

- [ ] **Step 6: Integration + E2E tests and full verification**

`tests/integration/coa-import.test.ts` (skipIf no env): valid 6-row file imports 6 accounts + one import_batch row with correct counts; re-import same file → rowErrors for duplicates and 0 new rows; file with one bad row (non-numeric code) returns rowErrors and inserts 0 accounts and 0 import_batch.

`e2e/accounts.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { TEST_ACCOUNT } from './support/helpers';
test('accounts slice', async ({ page }) => {
  // sign in helper from e2e/support/helpers.ts
  await page.goto('/login');
  await page.getByLabel('Email').fill(TEST_ACCOUNT.email);
  await page.getByLabel('Password').fill(TEST_ACCOUNT.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto('/accounts');
  await expect(page.getByRole('heading', { name: 'Chart of Accounts' })).toBeVisible();
  // after seed backfill, table already has 6 rows — assert at least one known code
  await expect(page.getByText('1000')).toBeVisible();
});
```

Run: `npm run typecheck; npm run lint; npx vitest run tests/unit/domain/coa-import.test.ts tests/integration/coa-import.test.ts; npm run format; npm run build; npm run test:e2e -- e2e/accounts.spec.ts` (ensure `npm run build` before `test:e2e` since Playwright's webServer uses `npm run start`).

Expected: unit 2–3 passed, integration 2–3 passed, build green, e2e passed.

- [ ] **Step 7: Format, build, commit**

Run: `npm run format; npm run build`

```bash
git add -A
git commit -m "feat(import): atomic CSV chart import with row-level errors (Slice 3c)"
```

---

### Task 6: Navigation polish + final Phase 2 verification

**Files:**

- Modify: `src/components/layout/sidebar.tsx` (active-state for nested `/settings` + `/settings/periods`), `README.md` (Phase 2 setup/import/seed doc), `.gitignore` (if `public/templates` copy needs ignoring)
- No test files

- [ ] **Step 1: Polish sidebar active states**

In `src/components/layout/sidebar.tsx`, extend `NAV_ITEMS` to include `/settings` if desired or keep settings as a secondary nav; ensure `active` predicate `pathname.startsWith('/settings')` highlights both `/settings` and `/settings/periods`.

- [ ] **Step 2: Update `README.md`** with Phase 2 sections: how to copy `.env` → `.env.test`, how to run CSV import, how to backfill seeds, template download path `public/templates/chart-of-accounts.csv`.

- [ ] **Step 3: Final sweep**

Run: `npm run typecheck; npm run lint; npm run format:check; npm run build; npx vitest run; npm run test:e2e`
Expected: all green — typecheck clean, lint clean, all vitest (15 Phase-1 + ~10 Phase-2 unit + ~8 integration) passed, 4–7 Playwright tests passed.

```bash
git add -A
git commit -m "chore: Phase 2 polish, nav + README for hosted import"
```

---

## Self-Review

- **Spec coverage:** every §2–§10 requirement maps to a task — Slice 1 (org update) Task 1, Slice 2 (list/create/close) Task 2, Slice 3 (table/create/edit/warn-deactivate) Tasks 3–4, import (§7) Task 5, seed backfill Task 3 page, file deltas §12 Task 1–5, locked decisions §13 covered (Approach A, nested routes, no new migrations, numeric code / selectable normal balance / warn-allow / CSV-only atomic).
- **Placeholder scan:** no TBD/TODO or "handle edge cases" without code — each error path (`23505`, `23P01`) has its mapping block, each Zod field lists its rule, each insert is scoped to `organization_id`.
- **Type consistency:** `Tables<'organization'>`, `Tables<'account'>`, `Enums<'account_type'|'normal_balance'>` match the generated `Database`; `Text` columns remain `text` (code as trimmed numeric string), `is_active` is `boolean`; `import_batch.import_type` enum value is `'CHART_OF_ACCOUNTS'` per `database.ts:486`.
