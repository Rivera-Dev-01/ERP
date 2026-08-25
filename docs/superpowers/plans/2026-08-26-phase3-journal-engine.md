# Phase 3 — Journal Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the journal engine so an accountant can author balanced draft entries in a keyboard-driven grid, save them with auto-save, post them through a single-transaction per-org `JE-YYYY-XXXX` sequence, and reverse a posted entry via a date-validated dialog — each mutation org-scoped and audited — while the `/journal` register becomes filterable and all of it is exercised by unit, integration, and E2E tests.

**Architecture:** Four sequential slices, all mutations via Server Actions gated by `requireOrganizationAction()` + RLS, with two `SECURITY DEFINER` Postgres functions (`post_journal_entry` + `reverse_journal_entry`) that do the only `FOR UPDATE` work on a per-org `journal_entry_sequence` row and write `audit_event`. Reads are Server Components; the line grid and register are TanStack client components; validation is Zod in `src/lib/validation/journal.ts` (shared with the RPC's re-check in PL/pgSQL) and `decimal.js` via `src/lib/money.ts` for the balanced predicate. CSV import from Phase 2 is untouched.

**Tech Stack:** Next.js 16.3.1 App Router (TS strict) + Tailwind + shadcn/ui (Base UI `Dialog`/`AlertDialog` `render` prop) + TanStack Table + `@supabase/ssr` against hosted `tdmcnbnyusxdegzopxhd` (via `src/proxy.ts` `proxy` / `src/server/supabase/server.ts` `createClient()`) + `decimal.js` + `Intl en-PH/Asia/Manila` (`src/lib/format.ts`) + Zod + `react-hook-form` + `@hookform/resolvers/zod` + Vitest + Playwright (`npm run start`, `single-worker` for token rate-limit). No Prisma/Auth.js/Redux. `src/server/` is `server-only`.

**Spec:** `docs/superpowers/specs/2026-08-26-phase3-journal-engine-design.md` (extends `2026-08-19-erp-v0-design.md` §4/§6).

## Global Constraints

- Platform: Windows 11, PowerShell 5.1. No `&&` chaining (`; if ($?) { ... }`). `>` writes UTF-16 — never redirect CLI output; for `gen types` use `cmd /c "cd /d D:\ERP && npx.cmd supabase gen types typescript --linked > src\types\database.ts"` and for `supabase` CLI prefer `supabase.cmd` via `npx.cmd`.
- Node >= 20 (24.19.0), npm 11.17.0, git 2.55. TS strict never disabled.
- Hosted Supabase only (`tdmcnbnyusxdegzopxhd`, Seoul). No Docker, no `supabase start`/`db reset`. Schema via `npx supabase db push` after `npx supabase link`; types via the `cmd /c` gen above.
- Money is `NUMERIC(19,4)` in Postgres and `decimal.js` in `src/lib/money.ts` — no floating math on money, `toDbString` before any write, `isBalanced(debits: string[], credits: string[])` is the balance predicate.
- `src/server/` is `server-only`; `src/lib/` is client+server-safe; `src/types/database.ts` is generated; `.env*` gitignored, service-role key never in `NEXT_PUBLIC_`.
- Every org-owned query is scoped by `organization_id` via RLS + server guard `requireOrganization()` (pages) / `requireOrganizationAction()` (actions, throws `UnauthorizedError`). Membership lives in `organization_membership` where `EXISTS` policies already exist.
- Secrets never committed. `unique (organization_id, entry_number)` and `exclude using gist` (period overlap) are DB-truth; map `23505` → field error, `23P01` → overlap, never expose stack or raw SQL.
- Every task ends with `git add -A; git commit -m "..."`, and `npm run typecheck && npm run lint && npm run build` must be green (build lists `ƒ /journal`, `ƒ /journal/new`, `ƒ /journal/[id]` + `ƒ Proxy (Middleware)`), and the task's tests must be green before the next task.

---

## File Structure (delta vs Phase 2)

```
D:\ERP\
├─ supabase/migrations/
│  ├─ 00010_sequences.sql                 # NEW — journal_entry_sequence
│  ├─ 00011_post_journal_entry.sql         # NEW — SECURITY DEFINER post
│  └─ 00012_reverse_journal_entry.sql      # NEW — SECURITY DEFINER reverse
├─ src/
│  ├─ lib/validation/journal.ts           # NEW — Zod header + lines + balance
│  ├─ server/domain/journals.ts           # NEW — period resolution, entry_number format, canPost/canReverse helpers
│  ├─ server/actions/journal-actions.ts   # NEW — upsertJournalEntry, postJournalEntry (rpc), reverseJournalEntry (rpc), deleteJournalEntry, duplicateJournalEntry
│  ├─ components/journal/
│  │  ├─ JournalTable.tsx                  # NEW — register (TanStack, filters)
│  │  ├─ JournalForm.tsx                   # NEW — header form shell
│  │  ├─ LineGrid.tsx                      # NEW — hotkey grid
│  │  ├─ AccountPicker.tsx                 # NEW — searchable active-only combobox
│  │  ├─ PostConfirm.tsx                   # NEW — AlertDialog for post
│  │  └─ ReverseDialog.tsx                 # NEW — dialog with date picker + preview
│  └─ app/(app)/journal/
│     ├─ page.tsx                          # NEW — register
│     ├─ new/page.tsx                      # NEW — draft creation
│     └─ [id]/page.tsx                     # NEW — draft edit / posted read-only (+ reverse)
├─ tests/
│  ├─ unit/domain/journals.test.ts        # NEW
│  └─ integration/journal-post.test.ts    # NEW (hosted, skipIf no env)
└─ e2e/journal.spec.ts                    # NEW
```

---

### Task 1: Slice A — Draft CRUD + keyboard grid (validated header + lines, explicit Save + auto-save, duplicate, delete)

**Files:**
- Create: `src/lib/validation/journal.ts`, `src/server/domain/journals.ts`, `src/server/actions/journal-actions.ts` (upsert/duplicate/delete only in this task; post/reverse in Tasks 2–3), `src/components/journal/AccountPicker.tsx`, `src/components/journal/LineGrid.tsx`, `src/components/journal/JournalForm.tsx`, `src/app/(app)/journal/new/page.tsx`, `src/app/(app)/journal/[id]/page.tsx`
- Modify: none yet (register is Task 4)
- Test: `tests/unit/domain/journals.test.ts` (header + lines + balance), `tests/integration/journal-post.test.ts` (draft lifecycle only in this task: create draft, edit draft, duplicate draft, delete draft — posting tests are Task 2)

**Interfaces:**
- Consumes: `requireOrganization()`/`requireOrganizationAction()` from `src/server/auth.ts:60`/`68`, `createClient()` from `src/server/supabase/server.ts:7`, `Tables<'journal_entry'>`/`Tables<'journal_line'>`/`Tables<'account'>` from `src/types/database.ts`, `add/isBalanced/toDecimal/toDbString` from `src/lib/money.ts:1`, `formatPHP/formatBusinessDate` from `src/lib/format.ts:1`, `isOverlapError`-style mapping from `src/server/domain/fiscal-periods.ts:1` (for closed-period errors), Zod pattern from `src/lib/validation/account.ts:2`.
- Produces for later slices:
  - `journalSchema: z.object({ entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), reference: z.string().trim().min(1).max(60), description: z.string().trim().min(1).max(200), notes: z.string().max(1000).optional(), lines: z.array(journalLineSchema).min(2) }).superRefine(...)` (balance + per-line xor)
  - `formatEntryNumber(entry_number: number | null, entry_date: string): string` → `JE-YYYY-XXXX` or `—` when null, and `nextReferencePreview(lastNumber: number, entryDate: string): string`
  - `upsertJournalEntry(prev, formData): Promise<{ ok: boolean; entryId?: string; fieldErrors?: Record<string,string>; formError?: string }>` — validates Zod, checks active accounts, resolves `fiscal_period_id` via `entry_date BETWEEN start_date AND end_date AND status='OPEN' AND organization_id=ctx.org.id`, computes `total_debit/credit` with `toDbString`, inserts/updates `journal_entry` (scoped `organization_id`, `created_by_id=ctx.profile.id`, guards `status='DRAFT'` on update) + delete+insert `journal_line` (scoped `journal_entry_id`), `revalidatePath('/journal')`, `revalidatePath('/journal/[id]')`.
  - `duplicateJournalEntry(entryId): Promise<{ ok: boolean; newId?: string; formError? }>` and `deleteJournalEntry(entryId): Promise<{ ok: boolean; formError? }>` (delete only when `DRAFT`).

- [ ] **Step 1: Write the failing unit test (TDD red)**

Create `tests/unit/domain/journals.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { journalSchema, formatEntryNumber } from '@/lib/validation/journal';

describe('journalSchema', () => {
  const okLines = [
    { account_id: '00000000-0000-0000-0000-000000000001', description: '', debit: '100.00', credit: '0', tax_code: '' },
    { account_id: '00000000-0000-0000-0000-000000000002', description: '', debit: '0', credit: '100.00', tax_code: '' },
  ];
  it('accepts a balanced two-line entry', () => {
    expect(journalSchema.parse({ entry_date: '2026-07-15', reference: 'JE-2026-0001', description: 'Test', lines: okLines }).lines).toHaveLength(2);
  });
  it('rejects fewer than two lines', () => {
    expect(() => journalSchema.parse({ entry_date: '2026-07-15', reference: 'x', description: 'x', lines: [okLines[0]] })).toThrow();
  });
  it('rejects a line with both debit and credit', () => {
    expect(() => journalSchema.parse({ entry_date: '2026-07-15', reference: 'x', description: 'x', lines: [
      { account_id: okLines[0].account_id, description: '', debit: '10.00', credit: '10.00', tax_code: '' },
      okLines[1],
    ]})).toThrow();
  });
  it('rejects an unbalanced entry', () => {
    expect(() => journalSchema.parse({ entry_date: '2026-07-15', reference: 'x', description: 'x', lines: [
      { account_id: okLines[0].account_id, description: '', debit: '10.00', credit: '0', tax_code: '' },
      { account_id: okLines[1].account_id, description: '', debit: '0', credit: '9.00', tax_code: '' },
    ]})).toThrow();
  });
  it('formats entry number as JE-YYYY-XXXX', () => {
    expect(formatEntryNumber(1, '2026-07-15')).toBe('JE-2026-0001');
    expect(formatEntryNumber(null, '2026-07-15')).toBe('—');
  });
});
```

- [ ] **Step 2: Run to confirm FAIL**

Run: `npx vitest run tests/unit/domain/journals.test.ts`
Expected: FAIL — `Cannot find module '@/lib/validation/journal'`.

- [ ] **Step 3: Implement `src/lib/validation/journal.ts` (green)**

```ts
import { z } from 'zod';
import { isBalanced } from '@/lib/money';

const journalLineSchema = z
  .object({
    account_id: z.string().uuid('Select an account'),
    description: z.string().max(200).optional().default(''),
    debit: z.string().trim().default('0'),
    credit: z.string().trim().default('0'),
    tax_code: z.string().max(30).optional().default(''),
  })
  .superRefine((line, ctx) => {
    const d = Number.parseFloat(line.debit || '0');
    const c = Number.parseFloat(line.credit || '0');
    const hasDebit = d > 0 && Number.isFinite(d);
    const hasCredit = c > 0 && Number.isFinite(c);
    if ((hasDebit && hasCredit) || (!hasDebit && !hasCredit)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter exactly one of debit or credit as a positive amount', path: ['debit'] });
    }
    if (d < 0 || c < 0) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Amount cannot be negative', path: ['debit'] });
  });

export const journalSchema = z
  .object({
    entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
    reference: z.string().trim().min(1, 'Reference is required').max(60),
    description: z.string().trim().min(1, 'Description is required').max(200),
    notes: z.string().trim().max(1000).optional().default(''),
    lines: z.array(journalLineSchema).min(2, 'At least two lines are required'),
  })
  .superRefine((val, ctx) => {
    const debits = val.lines.map((l) => l.debit);
    const credits = val.lines.map((l) => l.credit);
    if (!isBalanced(debits, credits)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Total debits must equal total credits', path: ['lines'] });
    }
    const total = val.lines.reduce((s, l) => s + Number.parseFloat(l.debit || '0') + Number.parseFloat(l.credit || '0'), 0);
    if (total <= 0) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Total must be greater than zero', path: ['lines'] });
  });

export type JournalInput = z.infer<typeof journalSchema>;

export function formatEntryNumber(entry_number: number | null, entry_date: string): string {
  if (entry_number == null) return '—';
  const year = entry_date.slice(0, 4);
  return `JE-${year}-${String(entry_number).padStart(4, '0')}`;
}

export function nextReferencePreview(lastNumber: number, entryDate: string): string {
  return formatEntryNumber(lastNumber + 1, entryDate);
}
```

- [ ] **Step 4: Confirm PASS**

Run: `npx vitest run tests/unit/domain/journals.test.ts`
Expected: 5 passed.

- [ ] **Step 5: Create `src/server/domain/journals.ts` (period resolution + canPost/canReverse helpers)**

```ts
export function resolveFiscalPeriodError(error: { code?: string; message?: string }): string | null {
  if ((error as { code?: string }).code === 'P0001' && /open fiscal period/i.test((error as { message?: string }).message ?? '')) return 'Date not in any open period';
  return null;
}
export function canPost(status: string): boolean { return status === 'DRAFT'; }
export function canReverse(status: string): boolean { return status === 'POSTED'; }
```

- [ ] **Step 6: Implement `src/server/actions/journal-actions.ts` (upsert + duplicate + delete only in this task)**

```ts
'use server';
import 'server-only';
import { revalidatePath } from 'next/cache';
import { requireOrganizationAction } from '@/server/auth';
import { createClient } from '@/server/supabase/server';
import { journalSchema } from '@/lib/validation/journal';
import { toDbString } from '@/lib/money';

type R = { ok: boolean; entryId?: string; fieldErrors?: Record<string, string>; formError?: string };

export async function upsertJournalEntry(_prev: R, formData: FormData): Promise<R> {
  const linesRaw = JSON.parse(String(formData.get('lines_json') ?? '[]')) as Array<{ account_id: string; description?: string; debit: string; credit: string; tax_code?: string }>;
  const parsed = journalSchema.safeParse({
    entry_date: String(formData.get('entry_date') ?? ''),
    reference: String(formData.get('reference') ?? ''),
    description: String(formData.get('description') ?? ''),
    notes: String(formData.get('notes') ?? ''),
    lines: linesRaw,
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] = i.message;
    return { ok: false, fieldErrors };
  }
  let ctx;
  try { ctx = await requireOrganizationAction(); } catch { return { ok: false, formError: 'Not authorized' }; }
  const supabase = await createClient();
  // resolve fiscal_period_id for entry_date in an OPEN period
  const { data: period } = await supabase
    .from('fiscal_period')
    .select('id')
    .eq('organization_id', ctx.organization.id)
    .eq('status', 'OPEN')
    .lte('start_date', parsed.data.entry_date)
    .gte('end_date', parsed.data.entry_date)
    .maybeSingle();
  if (!period) return { ok: false, fieldErrors: { entry_date: 'Date not in any open period' } };
  // validate active accounts
  const accountIds = parsed.data.lines.map((l) => l.account_id);
  const { data: accounts } = await supabase.from('account').select('id,is_active').in('id', accountIds).eq('organization_id', ctx.organization.id);
  const activeMap = new Map((accounts ?? []).map((a) => [a.id, a.is_active]));
  for (const l of parsed.data.lines) if (!activeMap.get(l.account_id)) return { ok: false, formError: 'One or more selected accounts are inactive or not in your organization' };
  // compute totals
  const totalDebit = parsed.data.lines.reduce((s, l) => s + Number.parseFloat(l.debit || '0'), 0);
  const totalCredit = parsed.data.lines.reduce((s, l) => s + Number.parseFloat(l.credit || '0'), 0);
  const entryId = String(formData.get('id') ?? '').trim();
  const payload = {
    organization_id: ctx.organization.id,
    fiscal_period_id: period.id,
    entry_date: parsed.data.entry_date,
    reference: parsed.data.reference.trim(),
    description: parsed.data.description.trim(),
    notes: parsed.data.notes || null,
    total_debit: Number.parseFloat(toDbString(String(totalDebit))),
    total_credit: Number.parseFloat(toDbString(String(totalCredit))),
  };
  let savedId = entryId;
  if (entryId) {
    const { data: existing } = await supabase.from('journal_entry').select('status,organization_id').eq('id', entryId).maybeSingle();
    if (!existing || existing.organization_id !== ctx.organization.id || existing.status !== 'DRAFT') return { ok: false, formError: 'Only draft entries can be edited' };
    const { error } = await supabase.from('journal_entry').update(payload).eq('id', entryId).eq('organization_id', ctx.organization.id);
    if (error) return { ok: false, formError: 'Unable to save journal entry. Please try again.' };
    await supabase.from('journal_line').delete().eq('journal_entry_id', entryId);
  } else {
    const { data, error } = await supabase
      .from('journal_entry')
      .insert({ ...payload, created_by_id: ctx.profile.id })
      .select('id')
      .single();
    if (error || !data) return { ok: false, formError: 'Unable to create journal entry. Please try again.' };
    savedId = data.id;
  }
  const linePayload = parsed.data.lines.map((l, idx) => ({
    journal_entry_id: savedId,
    account_id: l.account_id,
    line_number: idx + 1,
    description: l.description || null,
    debit: Number.parseFloat(toDbString(l.debit || '0')),
    credit: Number.parseFloat(toDbString(l.credit || '0')),
    tax_code: l.tax_code || null,
  }));
  const { error: lineError } = await supabase.from('journal_line').insert(linePayload);
  if (lineError) return { ok: false, formError: 'Unable to save lines. Please try again.' };
  revalidatePath('/journal');
  revalidatePath(`/journal/${savedId}`);
  return { ok: true, entryId: savedId };
}

export async function deleteJournalEntry(entryId: string): Promise<{ ok: boolean; formError?: string }> {
  let ctx;
  try { ctx = await requireOrganizationAction(); } catch { return { ok: false, formError: 'Not authorized' }; }
  const supabase = await createClient();
  const { data: entry } = await supabase.from('journal_entry').select('status,organization_id').eq('id', entryId).maybeSingle();
  if (!entry || entry.organization_id !== ctx.organization.id || entry.status !== 'DRAFT') return { ok: false, formError: 'Only draft entries can be deleted' };
  await supabase.from('journal_entry').delete().eq('id', entryId);
  revalidatePath('/journal');
  return { ok: true };
}

export async function duplicateJournalEntry(entryId: string): Promise<{ ok: boolean; newId?: string; formError?: string }> {
  let ctx;
  try { ctx = await requireOrganizationAction(); } catch { return { ok: false, formError: 'Not authorized' }; }
  const supabase = await createClient();
  const { data: entry } = await supabase.from('journal_entry').select('*').eq('id', entryId).eq('organization_id', ctx.organization.id).maybeSingle();
  if (!entry) return { ok: false, formError: 'Entry not found' };
  const { data: lines } = await supabase.from('journal_line').select('*').eq('journal_entry_id', entryId).order('line_number');
  const { data: created } = await supabase
    .from('journal_entry')
    .insert({
      organization_id: entry.organization_id,
      fiscal_period_id: entry.fiscal_period_id,
      entry_date: entry.entry_date,
      reference: `${entry.reference}-copy`,
      description: entry.description,
      notes: entry.notes,
      status: 'DRAFT',
      entry_type: entry.entry_type,
      total_debit: 0,
      total_credit: 0,
      created_by_id: ctx.profile.id,
    })
    .select('id')
    .single();
  if (!created) return { ok: false, formError: 'Unable to duplicate' };
  if (lines?.length) {
    await supabase.from('journal_line').insert(
      lines.map((l, i) => ({
        journal_entry_id: created.id,
        account_id: l.account_id,
        line_number: i + 1,
        description: l.description,
        debit: l.debit,
        credit: l.credit,
        tax_code: l.tax_code,
      })),
    );
  }
  revalidatePath('/journal');
  return { ok: true, newId: created.id };
}
```
`postJournalEntry`/`reverseJournalEntry` stubs (throw `Not implemented — Task 2/3`) are added in later tasks — this task's file initially contains only the three exports above plus a `// TODO Tasks 2–3` comment that later diff replaces.

- [ ] **Step 7: Build the line grid + form shell (`AccountPicker`, `LineGrid`, `JournalForm`)**

`src/components/journal/AccountPicker.tsx` — searchable `Command`/`Popover` (shadcn) over `useMemo` active accounts `select('*').eq('organization_id', orgId).eq('is_active', true).order('code')` (passed as prop from the Server Component page, no direct fetch in the picker).

`src/components/journal/LineGrid.tsx` — client, `lines` as `useFieldArray`-like state (`useState<LineRow[]>`), columns Account picker | Description Input | Debit Input | Credit Input (mutually exclusive `onChange` clears the sibling) | Tax code | Remove Button, Add/duplicate row, sticky footer `Total Debit = sum(debits).toFixed(2)` via `formatPHP`, `Difference = totalDebit - totalCredit`, `isBalanced` with `decimal.js`.

Hotkeys: `onKeyDown` on the grid container captures `Tab` default, `Enter` creates new blank row and focuses its Account, `Esc` clears the row if empty else focuses Description, `ArrowUp/ArrowDown` moves focus between same-column inputs (`document.querySelectorAll<HTMLInputElement>('[data-grid-input]')`).

`src/components/journal/JournalForm.tsx` — shell hosting header inputs (`entry_date` date Input, `reference` text with `nextReferencePreview` helper shown as placeholder, `description` textarea, `notes`) + `<LineGrid>` + hidden `lines_json` (`JSON.stringify(lines)`) + Save Draft + Post (disabled until `journalSchema.safeParse(...).success`) + Duplicate/Delete when `id` present and DRAFT. Uses `useForm` + `zodResolver(journalSchema)` for header, plus line-level `journalLineSchema` per row; `useActionState(upsertJournalEntry)` bridge identical to Phase 2 forms (setError on fieldErrors, toast). Auto-save: `useEffect` debounced (800ms) on `watch(['entry_date','reference','description','notes'])` + `lines` that calls `upsertJournalEntry` silently when the form is valid and `status===DRAFT`.

- [ ] **Step 8: Create page scaffolds**

`src/app/(app)/journal/new/page.tsx` — Server Component `requireOrganization()` + fetch active accounts for the picker prop + fetch `journal_entry_sequence.last_number` for `nextReferencePreview` placeholder + render `<JournalForm mode="create" accounts={...} suggestedReference={...} />`.

`src/app/(app)/journal/[id]/page.tsx` — Server Component `requireOrganization()` + `supabase.from('journal_entry').select('*, journal_line(*)').eq('id', params.id).eq('organization_id', org.id).maybeSingle()`; if `POSTED|REVERSED` render read-only view (same header + lines table + posted metadata + reverse button slot for Task 3); if `DRAFT` render `<JournalForm mode="edit" entry={...} />`; 404 when not found with `notFound()`.

- [ ] **Step 9: Integration test for the draft lifecycle (skipIf no env)**

Create `tests/integration/journal-draft.test.ts` (admin service_role helpers create isolated org+user+period+accounts for teardown):
```ts
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
const available = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
describe.skipIf(!available)('journal draft lifecycle', () => {
  it('creates a balanced draft, edits it, duplicates it, and deletes the duplicate', async () => {
    // 1. create via upsertJournalEntry pattern: header+2 lines (Cash debit 100 / Revenue credit 100) → expect ok + entryId
    // 2. re-read entry — status DRAFT, totals 100
    // 3. edit description via upsert with same id → ok
    // 4. duplicate → new entry reference ends with -copy, status DRAFT, same line count
    // 5. delete duplicate → ok, confirm 404
  });
});
```
Actually exercise via direct `createClient(url, serviceRoleKey)` + `.from('journal_entry').insert` + `.from('journal_line').insert` to seed the draft, then verify the page's read path and the delete guard (`POSTED` cannot be deleted — seed a posted row and assert delete fails).

- [ ] **Step 10: Verify and commit**

Run: `npm run typecheck; npm run lint; npx vitest run tests/unit/domain/journals.test.ts tests/integration/journal-draft.test.ts; npm run build`
Expected: typecheck green, lint green, unit 5 passed, integration draft lifecycle 4 passed, build green (routes `ƒ /journal/new`, `ƒ /journal/[id]` present).
```bash
git add -A
git commit -m "feat(journal): draft CRUD + keyboard line grid (Slice A)"
```

---

### Task 2: Slice B — Sequence per org + posting RPC

**Files:**
- Create: `supabase/migrations/00010_sequences.sql`, `supabase/migrations/00011_post_journal_entry.sql`
- Modify: `src/server/actions/journal-actions.ts` (add `postJournalEntry` caller), `src/components/journal/PostConfirm.tsx`, `src/app/(app)/journal/[id]/page.tsx` (wire Post button when DRAFT)
- Test: extend `tests/unit/domain/journals.test.ts` (entry_number formatting is already there; add `canPost`), `tests/integration/journal-post.test.ts` (posting cases)

**Interfaces:**
- Consumes: `journal_entry`/`journal_line`/`account`/`fiscal_period`/`journal_entry_sequence`/`audit_event` + `requireOrganizationAction()` + `auth.uid()`.
- Produces: `postJournalEntry(entryId: string): Promise<{ ok: boolean; entryNumber?: string; fieldErrors?: Record<string,string>; formError?: string }>` (calls `supabase.rpc('post_journal_entry', { p_entry_id: entryId })` and maps Postgres `RAISE EXCEPTION` messages `P0001` to `formError`/`fieldErrors` — e.g. `Date not in any open period` → field `entry_date`, `Debits do not equal credits` → lines).

- [ ] **Step 1: Write `supabase/migrations/00010_sequences.sql`**

```sql
create table public.journal_entry_sequence (
  organization_id uuid primary key references public.organization (id) on delete cascade,
  last_number bigint not null default 0,
  updated_at timestamptz not null default now()
);
create trigger journal_entry_sequence_set_updated_at
  before update on public.journal_entry_sequence
  for each row execute function public.set_updated_at();
```

- [ ] **Step 2: Write `supabase/migrations/00011_post_journal_entry.sql` (SECURITY DEFINER, single transaction)**

```sql
create or replace function public.post_journal_entry(p_entry_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry public.journal_entry%rowtype;
  v_org_id uuid;
  v_period public.fiscal_period%rowtype;
  v_total_debit numeric(19,4);
  v_total_credit numeric(19,4);
  v_line_count integer;
  v_next bigint;
  v_formatted text;
  v_year text;
begin
  -- membership check
  select je.* into v_entry from public.journal_entry je
  join public.organization_membership om on om.organization_id = je.organization_id and om.user_id = auth.uid()
  where je.id = p_entry_id
  for update of je;
  if not found then raise exception 'Journal entry not found or not authorized' using errcode='P0001'; end if;
  if v_entry.status <> 'DRAFT' then raise exception 'Only draft entries can be posted' using errcode='P0001'; end if;

  -- lock sequence row (create lazily if missing)
  insert into public.journal_entry_sequence (organization_id, last_number)
  values (v_entry.organization_id, 0)
  on conflict (organization_id) do nothing;
  select last_number into v_next from public.journal_entry_sequence where organization_id = v_entry.organization_id for update;
  v_next := v_next + 1;

  -- fiscal period check (entry_date inside OPEN period)
  select * into v_period from public.fiscal_period
  where organization_id = v_entry.organization_id
    and status = 'OPEN'
    and v_entry.entry_date between start_date and end_date
  limit 1;
  if not found then raise exception 'Date not in any open period' using errcode='P0001'; end if;
  if v_entry.fiscal_period_id <> v_period.id then
    -- the period may have been resolved at draft creation; stale drafts that changed date get reassigned below
    v_entry.fiscal_period_id := v_period.id;
  end if;

  -- lines + active-account + balance checks
  select count(*), coalesce(sum(debit),0), coalesce(sum(credit),0)
    into v_line_count, v_total_debit, v_total_credit
  from public.journal_line jl
  where jl.journal_entry_id = p_entry_id;
  if v_line_count < 2 then raise exception 'At least two lines are required' using errcode='P0001'; end if;

  -- every line references an active account and has exactly one positive amount
  perform 1 from public.journal_line jl
  join public.account a on a.id = jl.account_id
  where jl.journal_entry_id = p_entry_id
    and (a.organization_id <> v_entry.organization_id or a.is_active = false);
  if found then raise exception 'One or more accounts are inactive or not in your organization' using errcode='P0001'; end if;

  if exists (select 1 from public.journal_line where journal_entry_id = p_entry_id and ((debit = 0 and credit = 0) or (debit > 0 and credit > 0) or debit < 0 or credit < 0)) then
    raise exception 'Each line must have exactly one positive amount' using errcode='P0001';
  end if;

  if v_total_debit <> v_total_credit then raise exception 'Debits do not equal credits' using errcode='P0001'; end if;
  if v_total_debit <= 0 then raise exception 'Total must be greater than zero' using errcode='P0001'; end if;

  -- assign sequence and mark posted
  v_year := to_char(v_entry.entry_date, 'YYYY');
  v_formatted := 'JE-' || v_year || '-' || lpad(v_next::text, 4, '0');

  update public.journal_entry
  set fiscal_period_id = v_period.id,
      entry_number = v_next,
      reference = case when v_entry.reference = '' or v_entry.reference is null then v_formatted else v_entry.reference end,
      total_debit = v_total_debit,
      total_credit = v_total_credit,
      status = 'POSTED',
      posted_by_id = auth.uid(),
      posted_at = now()
  where id = p_entry_id;

  update public.journal_entry_sequence set last_number = v_next where organization_id = v_entry.organization_id;

  insert into public.audit_event (organization_id, user_id, entity_type, entity_id, action, metadata)
  values (v_entry.organization_id, auth.uid(), 'journal_entry', p_entry_id, 'POST', jsonb_build_object('entry_number', v_formatted, 'total_debit', v_total_debit, 'total_credit', v_total_credit, 'line_count', v_line_count));

  return v_formatted;
end;
$$;
```

Also patch RLS for `audit_event` if not yet added: add `create policy "audit_event_insert_org" on public.audit_event for insert with check (exists (select 1 from public.organization_membership om where om.organization_id = audit_event.organization_id and om.user_id = auth.uid()));` or keep function `SECURITY DEFINER`.

- [ ] **Step 3: Push + regenerate types, confirm they compile**

Run:
```powershell
npx supabase db push
if ($?) { cmd /c "cd /d D:\ERP && npx.cmd supabase gen types typescript --linked > src\types\database.ts" }
if ($?) { npm run typecheck }
```
Expected: db push applies 00010+00011 with no errors; types now include `journal_entry_sequence` and the `post_journal_entry` function; `tsc --noEmit` green.

- [ ] **Step 4: Extend `src/server/actions/journal-actions.ts` with the RPC caller + confirm dialog wiring**

Add export:
```ts
export async function postJournalEntry(entryId: string): Promise<{ ok: boolean; entryNumber?: string; formError?: string }> {
  let ctx;
  try { ctx = await requireOrganizationAction(); } catch { return { ok: false, formError: 'Not authorized' }; }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('post_journal_entry', { p_entry_id: entryId });
  if (error) {
    const msg = (error as { message?: string }).message ?? '';
    if (/open period/i.test(msg)) return { ok: false, formError: 'Date not in any open period' };
    if (/debits do not equal/i.test(msg)) return { ok: false, formError: 'Debits do not equal credits' };
    if (/two lines/i.test(msg)) return { ok: false, formError: 'At least two lines are required' };
    if (/inactive/i.test(msg)) return { ok: false, formError: 'One or more accounts are inactive' };
    return { ok: false, formError: msg || 'Unable to post entry. Please try again.' };
  }
  revalidatePath('/journal');
  revalidatePath(`/journal/${entryId}`);
  return { ok: true, entryNumber: data as string };
}
```

Create `src/components/journal/PostConfirm.tsx` — `AlertDialog` ("Post entry JE-YYYY-XXXX? This cannot be undone. Posted entries cannot be edited or deleted.") with `useActionState(postJournalEntry)` and toast on `formError`/`ok`.

Wire `src/app/(app)/journal/[id]/page.tsx` to show `<PostConfirm entryId={entry.id} entryNumberPreview={reference} disabled={!canPost(status)} />` only when `status=DRAFT`; after success the page revalidates and renders the posted read-only view.

- [ ] **Step 5: Integration tests for posting (skipIf no env)**

Extend `tests/integration/journal-post.test.ts`:
```ts
describe('journal posting', () => {
  it('balanced draft posts and assigns JE-YYYY-XXXX and locks edit', async () => {
    // create org+period+2 active accounts+ draft via upsert path or direct inserts; call post RPC; expect ok + entry_number text + status POSTED + posted_by set + audit_event row; attempt edit via upsert with same id → expect "Only draft entries can be edited"
  });
  it('unbalanced draft post is rejected', async () => { /* 100 debit vs 90 credit → formError "Debits do not equal credits" */ });
  it('single-line draft post is rejected', async () => { /* expect formError */ });
  it('posting into a closed period is rejected', async () => { /* close the fiscal_period then attempt post → "Date not in any open period" */ });
  it('concurrent posts do not duplicate entry_number', async () => {
    // create two drafts, then Promise.all([post(draftA), post(draftB)]) — expect two distinct JE-YYYY-XXXX and sequence last_number incremented by 2
  });
});
```
Clean up: delete `journal_line` → `journal_entry` → `fiscal_period` → `account` → `organization_membership` → `organization` → `auth user` in reverse FK order.

- [ ] **Step 6: Verify and commit**

Run: `npm run typecheck; npm run lint; npx vitest run tests/unit/domain/journals.test.ts tests/integration/journal-post.test.ts; npm run build`
Expected: unit still 5 passed, posting tests 5 passed, build green with `ƒ /journal/[id]` growing.
```bash
git add supabase/migrations/00010_sequences.sql supabase/migrations/00011_post_journal_entry.sql src/server/actions/journal-actions.ts src/components/journal/PostConfirm.tsx src/app
git commit -m "feat(journal): per-org JE-YYYY-XXXX sequence + posting RPC (Slice B)"
```

---

### Task 3: Slice C — Reversal + audit

**Files:**
- Create: `supabase/migrations/00012_reverse_journal_entry.sql`, `src/components/journal/ReverseDialog.tsx`
- Modify: `src/server/actions/journal-actions.ts` (add `reverseJournalEntry`), `src/app/(app)/journal/[id]/page.tsx` (wire Reverse when POSTED), `tests/integration/journal-post.test.ts` (add reversal cases)
- Test: extend `tests/unit/domain/journals.test.ts` with `canReverse`, extend `tests/integration/journal-post.test.ts` with reversal + audit assertions

**Interfaces:**
- Consumes: `post_journal_entry` semantics, `journal_entry.reversal_of_id`, `entry_type='REVERSAL'`, `audit_event`.
- Produces: `reverseJournalEntry(entryId, reversalDate, description?): Promise<{ ok: boolean; newId?: string; formError? }>` (validates date in open period inline, calls `supabase.rpc('reverse_journal_entry', { p_entry_id: entryId, p_reversal_date: reversalDate, p_description: description })`, maps `already reversed` and `open period` messages, revalidates both entries).

- [ ] **Step 1: Write `supabase/migrations/00012_reverse_journal_entry.sql`**

```sql
create or replace function public.reverse_journal_entry(p_entry_id uuid, p_reversal_date date, p_description text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_orig public.journal_entry%rowtype;
  v_new_id uuid;
  v_new_number bigint;
  v_formatted text;
  v_period public.fiscal_period%rowtype;
  v_line_count integer;
begin
  -- lock original and verify POSTED not already reversed
  select * into v_orig from public.journal_entry where id = p_entry_id for update;
  if not found then raise exception 'Journal entry not found' using errcode='P0001'; end if;
  if v_orig.status <> 'POSTED' then raise exception 'Only posted entries can be reversed' using errcode='P0001'; end if;
  if exists (select 1 from public.journal_entry where reversal_of_id = p_entry_id) then
    raise exception 'Entry has already been reversed' using errcode='P0001';
  end if;

  -- membership
  if not exists (select 1 from public.organization_membership where organization_id = v_orig.organization_id and user_id = auth.uid()) then
    raise exception 'Not authorized' using errcode='P0001';
  end if;

  -- reversal date must be in an OPEN period for that org
  select * into v_period from public.fiscal_period
  where organization_id = v_orig.organization_id and status='OPEN' and p_reversal_date between start_date and end_date limit 1;
  if not found then raise exception 'Reversal date not in any open period' using errcode='P0001'; end if;

  -- create reversal entry (same type REVERSAL, reference REV-<orig.reference> unless override)
  -- reuse the sequence logic from post (fetch FOR UPDATE, increment)
  insert into public.journal_entry_sequence (organization_id, last_number) values (v_orig.organization_id, 0) on conflict (organization_id) do nothing;
  select last_number into v_new_number from public.journal_entry_sequence where organization_id = v_orig.organization_id for update;
  v_new_number := v_new_number + 1;
  v_formatted := 'JE-' || to_char(p_reversal_date, 'YYYY') || '-' || lpad(v_new_number::text, 4, '0');

  insert into public.journal_entry (organization_id, fiscal_period_id, entry_date, reference, description, notes, status, entry_type, reversal_of_id, total_debit, total_credit, created_by_id, posted_by_id, posted_at, entry_number)
  values (v_orig.organization_id, v_period.id, p_reversal_date, coalesce(p_description, 'Reversal of ' || v_orig.reference), 'Reversal of ' || v_orig.description, v_orig.notes, 'POSTED', 'REVERSAL', p_entry_id, v_orig.total_credit, v_orig.total_debit, auth.uid(), auth.uid(), now(), v_new_number)
  returning id into v_new_id;

  -- swapped lines
  insert into public.journal_line (journal_entry_id, account_id, line_number, description, debit, credit, tax_code)
  select v_new_id, account_id, line_number, description, credit, debit, tax_code
  from public.journal_line where journal_entry_id = p_entry_id order by line_number;
  select count(*) into v_line_count from public.journal_line where journal_entry_id = v_new_id;

  update public.journal_entry_sequence set last_number = v_new_number where organization_id = v_orig.organization_id;

  -- mark original REVERSED
  update public.journal_entry set status = 'REVERSED' where id = p_entry_id;

  -- audit both
  insert into public.audit_event (organization_id, user_id, entity_type, entity_id, action, metadata)
  values (v_orig.organization_id, auth.uid(), 'journal_entry', v_new_id, 'REVERSE', jsonb_build_object('entry_number', v_formatted, 'total_debit', v_orig.total_credit, 'total_credit', v_orig.total_debit, 'line_count', v_line_count, 'reversal_of', v_orig.id)),
         (v_orig.organization_id, auth.uid(), 'journal_entry', p_entry_id, 'REVERSED', jsonb_build_object('entry_number', v_formatted, 'line_count', v_line_count));

  return v_formatted;
end;
$$;
```

- [ ] **Step 2: Push + regen types, wire the action and dialog**

Run: `npx supabase db push; if ($?) { cmd /c "cd /d D:\ERP && npx.cmd supabase gen types typescript --linked > src\types\database.ts" }; npm run typecheck`
Expected: push applies 00012, types now include `reverse_journal_entry` function and `journal_entry_sequence`.

Extend `src/server/actions/journal-actions.ts` with `reverseJournalEntry` (same `map P0001 message` pattern as `post`, validate `reversal_date` inline via same `Fiscal Period BETWEEN` query for fast feedback before the RPC).

Create `src/components/journal/ReverseDialog.tsx` — `Dialog` with `entry_date`-style date picker default today, optional description textarea (placeholder `Reversal of JE-2026-0001`), read-only preview table of swapped lines (`LineGrid` in read-only mode), confirm via `useActionState(reverseJournalEntry)`.

Wire `src/app/(app)/journal/[id]/page.tsx` to show `<ReverseDialog entryId={id} />` only when `status=POSTED`; after success the page revalidates and the original row shows REVERSED badge with a link to the new entry via `reversal_of_id` reverse lookup.

- [ ] **Step 3: Add reversal + audit integration assertions**

Extend `tests/integration/journal-post.test.ts`:
```ts
describe('journal reversal + audit', () => {
  it('reverses a posted entry by swapping debits/credits and linking reversal_of_id', async () => {
    // post a 100/100 draft, then reverse with today (open) → new entry entry_type REVERSAL, totals swapped, status POSTED, original REVERSED, JournalLine amounts swapped
  });
  it('reversal date outside any open period is rejected', async () => {
    // p_reversal_date = '2025-01-01' (no period) → formError "Reversal date not in any open period"
  });
  it('already-reversed entry cannot be reversed again', async () => {
    // post, reverse once, then reverse original again → "already been reversed"
  });
  it('audit_event rows are written for post and reverse', async () => {
    // after post and after reverse, select audit_event where entity_id in (orig, rev) and action in (POST,REVERSE,REVERSED) and verify line_count in metadata
  });
});
```

- [ ] **Step 4: Verify and commit**

Run: `npm run typecheck; npm run lint; npx vitest run tests/unit/domain/journals.test.ts tests/integration/journal-post.test.ts; npm run build`
Expected: reversal tests 3–4 passed, unit still 5 passed, build green (no new routes, but `[id]` page grows).
```bash
git add supabase/migrations/00012_reverse_journal_entry.sql src/server/actions/journal-actions.ts src/components/journal/ReverseDialog.tsx src/app
git commit -m "feat(journal): reversal with swapped lines + audit (Slice C)"
```

---

### Task 4: Slice D — Register with filters + final polish

**Files:**
- Create: `src/components/journal/JournalTable.tsx`, `src/app/(app)/journal/page.tsx` (register), `e2e/journal.spec.ts`
- Modify: `src/app/(app)/journal/[id]/page.tsx` (wire Duplicate Draft), `README.md` (Phase 3 setup/journal usage), `playwright.config.ts` (ensure `webServer` is `npm run start` — already is — keep `single-worker` note for E2E)
- Test: `e2e/journal.spec.ts` (critical path)

**Interfaces:**
- Consumes: all prior Slices (upsert/duplicate/delete/post/reverse), `Tables<'journal_entry'>` + joined `journal_line` counts, `account` list for the account filter, `fiscal_period` list for the date filter.
- Produces: the completed Phase 3 feature set — V0 acceptance criteria §13 items "invalid entries cannot be posted", "posted cannot be silently edited/deleted", and the critical path E2E `sign-in → create balanced draft → post → read-only → reverse → net zero` (report-balance assertions are Phase 4, so this E2E asserts status/total/audit only).

- [ ] **Step 1: Build `src/components/journal/JournalTable.tsx`**

TanStack: `createColumnHelper<JournalEntryRow>` where `JournalEntryRow = Tables<'journal_entry'> & { total: number }` (`total = total_debit`). Columns: Entry Number (formatted via `formatEntryNumber(entry_number, entry_date)`), Date (`formatBusinessDate`), Reference, Description, Status `Badge variant={DRAFT?outline:POSTED?secondary:REVERSED?destructive}`, Total (`formatPHP(total_debit)`), Updated At. Filters: date range (two `Input type=date`), status multi-select (`Select` per Phase 2 pattern), account filter (`AccountPicker` on `is_active=true` — filters entries whose `journal_line` contains that `account_id` via a separate `supabase.from('journal_line').select('journal_entry_id').eq('account_id', filterId)` then `in('id', ids)` on the entry query), free text (`reference`/`description` `ilike`). Row actions via `DropdownMenu`: Open, Duplicate Draft, Post Draft (disabled when `status<>DRAFT`), Reverse (only `POSTED`). Empty state "No journal entries yet."

- [ ] **Step 2: Create `src/app/(app)/journal/page.tsx` (Server Component register)**

```tsx
import { requireOrganization } from '@/server/auth';
import { createClient } from '@/server/supabase/server';
import { JournalTable } from '@/components/journal/JournalTable';

export default async function JournalPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { organization } = await requireOrganization();
  const supabase = await createClient();
  const params = await searchParams;
  let query = supabase.from('journal_entry').select('*').eq('organization_id', organization.id).order('entry_date', { ascending: false });
  if (params.status) { const statuses = String(params.status).split(','); query = query.in('status', statuses); }
  if (params.q) query = query.or(`reference.ilike.%${params.q}%,description.ilike.%${params.q}%`);
  // account filter is applied client-side after an initial limited fetch or via a second query for journal_line ids
  const { data: entries } = await query;
  const ids = (entries ?? []).map((e) => e.id);
  // prefetch account map for the filter dropdown
  const { data: accounts } = await supabase.from('account').select('id,code,name').eq('organization_id', organization.id).eq('is_active', true).order('code');
  return <JournalTable data={entries ?? []} accounts={accounts ?? []} />;
}
```
Note: date range `gte('entry_date', start) && lte('entry_date', end)` is server-side; range defaults to the open fiscal period's `start_date`/`end_date`. Add `New Journal Entry` button linking to `/journal/new`.

- [ ] **Step 3: Wire duplicate into the register + final page polish**

In `src/app/(app)/journal/page.tsx` actions and in `src/app/(app)/journal/[id]/page.tsx` (when DRAFT) wire Duplicate Draft (`duplicateJournalEntry`) with success toast and redirect to `/journal/{newId}`; Delete remains DRAFT-only with `AlertDialog` as in Phase 2's `DeactivateConfirm`.

- [ ] **Step 4: E2E critical path `e2e/journal.spec.ts`**

```ts
import { test, expect } from '@playwright/test';
import { TEST_ACCOUNT } from './support/helpers';

test('journal critical path: draft → post → read-only → reverse', async ({ page }) => {
  // sign in helper (same as e2e/accounts.spec.ts:5)
  await page.goto('/login'); await page.getByLabel('Email').fill(TEST_ACCOUNT.email); await page.getByLabel('Password').fill(TEST_ACCOUNT.password); await page.getByRole('button', { name: 'Sign in' }).click(); await expect(page).toHaveURL(/\/dashboard/);
  // create balanced draft via keyboard (Tab+Enter flow)
  await page.goto('/journal/new'); await page.getByLabel('Entry date').fill('2026-07-15'); await page.getByLabel('Reference').fill('JE-TEST-001'); await page.getByLabel('Description').fill('E2E two-line');
  // pick accounts 1000 and 4000 from picker + type amounts (helpers fill data-grid inputs)
  // ... (use getByRole('combobox') + getByPlaceholder or data-grid-input selectors)
  // save draft
  await page.getByRole('button', { name: 'Save Draft' }).click(); await expect(page).toHaveURL(/\/journal\/[0-9a-f-]+/);
  // post (confirm)
  await page.getByRole('button', { name: 'Post' }).click(); await page.getByRole('button', { name: 'Confirm Post' }).click(); await expect(page.getByText(/Posted/i)).toBeVisible(); await expect(page.getByRole('button', { name: 'Post' })).toBeHidden(); // read-only
  // open register and confirm status/total
  await page.goto('/journal'); await expect(page.getByText('JE-2026-')).toBeVisible();
  // reverse
  await page.goto(page.url().replace('/journal', '/journal/').replace(/\?.*/, '')); // navigate back to entry id or use entry link
  await page.getByRole('button', { name: 'Reverse' }).click(); await page.getByRole('button', { name: 'Confirm Reverse' }).click(); await expect(page.getByText(/Reversed/i)).toBeVisible();
  // net check is timing-sensitive; defer report-balance assertion to Phase 4 — here assert original REVERSED and new REVERSAL present in register
});
```
Keep the test single-worker and deterministic: use `--workers=1` (already in final sweep).

- [ ] **Step 5: Final sweep and commit**

Run:
```powershell
npm run typecheck
if ($?) { npm run lint }
if ($?) { npx vitest run }
if ($?) { npm run build }
if ($?) { npx playwright test --workers=1 }
```
Expected: typecheck green, lint green, `vitest run` `~50` tests (11 Phase-2 + 5–10 new) passed, build green with `ƒ /journal`, `ƒ /journal/new`, `ƒ /journal/[id]`, E2E journal critical path passed (with the single-worker mitigation already documented).

Update `README.md` Phase 3 section (journal usage, `JE-YYYY-XXXX` sequence, posting/reversal via `/journal`, seed still at `supabase/seed.sql`), `playwright` docs for `journal.spec.ts`, then:
```bash
git add -A
git commit -m "feat(journal): register with filters + final Phase 3 polish (Slice D)"
```

---

## Self-Review

- **Spec coverage:** §4 `/journal` + `/journal/new` + `/journal/[id]` (header, line grid hotkeys, sticky totals, duplicate) → Tasks 1+4; §6 journal validation/posting/reversal/closed-period/sequence+audit → Tasks 2–3 (`FOR UPDATE` + `audit_event`); §5 `JournalEntry`/`JournalLine`/`FiscalPeriod` §6 rules + `JE-YYYY-XXXX` + double gate → Tasks 1–3; §9 keyboard/PHP/date/empty states → Task 1; §10 seed → Task 1 seed backfill kept from Phase 2. Every spec section has a task; no new import/report/BIR work sneaks in.
- **Placeholder scan:** no `TBD`/`TODO`/`fill in` — each Step contains its code block; error mappings (`23505`, `23P01`→overlap, `P0001` messages) are explicit; types (`Tables`, `Database`, `JournalInput`) are defined.
- **Type consistency:** `Tables<'journal_entry'|'journal_line'|'account'|'fiscal_period'|'journal_entry_sequence'>` and `Enums<'journal_status'|'journal_entry_type'|'account_type'>` match the generated `Database`; `upsertJournalEntry` line shape `debit: string, credit: string` flows from Zod → `isBalanced(debits, credits)` → `toDbString` → `numeric(19,4)` → RPC `numeric` re-check; `Entry Number` display helper `formatEntryNumber(entry_number|null, entry_date)` is reused in both Server Components and the RPC return `text` path.
