# Phase 3 — Journal Engine — Design Specification

Date: 2026-08-26
Status: Ready for review
Phase: 3 of 6 (Phase 2 accounting master data shipped 2026-08-26)
Spec: Extends `docs/superpowers/specs/2026-08-19-erp-v0-design.md` §4, §6 and `2026-08-26-phase2-accounting-master-data-design.md`

## 1. Objective

Deliver the journal core so the accountant can create, edit, and post balanced Journal Entries through a keyboard-driven line grid, with a single-transaction server-side posting that assigns `JE-YYYY-XXXX` entry numbers, and a reversal that creates a swapped posted entry — each step guarded by organization membership, open-period checks, and an audit trail. Every slice is runnable and keeps the app in a good state for the reports phase.

## 2. Scope

### Must include (this phase)

- **Draft workspace** at `/journal/new` and `/journal/[id]`: header fields (`entry_date` defaulting to today when today lies in an OPEN fiscal period, otherwise first open period's `start_date`; `reference` auto-suggested as `JE-YYYY-XXXX` preview and editable — trimmed 1–60; `description` 1–200 required; `notes` optional) and a line grid (Account searchable picker limited to `is_active=true` accounts, optional line `description`, `debit` xor `credit` exactly one positive amount, optional `tax_code` plain text). Add / duplicate (copies account + description + amount) / remove row; sticky footer shows Total Debit, Total Credit, Difference via `decimal.js` + `Intl en-PH`; inline validation; Post disabled until the entry is balanced and valid. Full hotkeys: Tab moves across Account→Description→Debit→Credit within a row, Enter creates a new blank row and focuses its Account cell, Esc clears the row, Up/Down moves between rows.
- **Explicit Save + auto-save Draft**: "Save Draft" persists header+lines via a validated Server Action CRUD path (no RPC) that also resolves `fiscal_period_id` via `entry_date BETWEEN start_date AND end_date` in an OPEN period and computes `total_debit/credit` with `toDbString`; debounced auto-save on blur/change reuses the same path; "Duplicate Draft" copies a draft's header/lines to a new draft with `reference` suffixed `-copy`; "Delete Draft" is available only when `status=DRAFT`.
- **Register** at `/journal`: searchable/filterable by date range, status, account, and free text on `reference`/`description`; columns Entry Number (formatted `JE-YYYY-XXXX` or `—` while DRAFT), Date, Reference, Description, Status badge (DRAFT/POSTED/REVERSED), Total, Updated At; row actions Open / Duplicate Draft / Post Draft (confirm) / Reverse Posted (dialog). Posted entries are read-only; no edit/delete for POSTED/REVERSED.
- **Posting RPC** (`00010` + `00011`): per-org sequence table `journal_entry_sequence (organization_id PK FK, last_number bigint)` incremented under `SELECT ... FOR UPDATE`; `post_journal_entry(p_entry_id uuid) RETURNS text` as `SECURITY DEFINER` verifies membership, locks the entry `FOR UPDATE`, reloads header+lines, re-runs all validations in PL/pgSQL (open fiscal period, ≥2 lines, active accounts, `debit=0 xor credit=0`, `SUM(debit)=SUM(credit)` via `numeric`, `total>0`, required header), assigns `next_number` as `JE-YYYY-XXXX` (`YYYY` from `entry_date`, `XXXX` zero-padded 4 digits from `last_number+1`), saves exact totals, sets `status=POSTED`, `posted_by_id=auth.uid()`, `posted_at=now()`, writes `audit_event` (`entity_type='journal_entry', action='POST', metadata { entry_number, total_debit, total_credit, line_count }`), all in one transaction.
- **Reversal** (`00012`): `reverse_journal_entry(p_entry_id uuid, p_reversal_date date, p_description text default null) RETURNS text` verifies `status=POSTED` not already reversed, validates `p_reversal_date` in an OPEN period, creates a new `entry_type=REVERSAL` entry with `reference='REV-'||orig.reference`, `reversal_of_id=orig.id`, lines copied with `debit↔credit` swapped, then posts it through the same sequence/audit path; only on success marks the original `status=REVERSED`. UI is a dialog on the posted entry's page: pick `reversal_date` default today (validated open), optional description override auto `Reversal of JE-YYYY-XXXX`, read-only swapped-lines preview, confirm.
- **Audit**: `audit_event` rows for POST and REVERSE; `audit_event` insert RLS is added (`FOR INSERT WITH CHECK` via org membership) or RPC stays `SECURITY DEFINER` to bypass the missing policy.

### Explicitly out of scope (deferred)

- Reports and exports (Phase 4), journal import/XLSX (Phase 5), recurring templates, attachments, BIR forms, subledgers, bank rec, inventory, payroll, fixed assets, multi-org switching, mobile/OCR.

### Source of truth

`2026-08-19-erp-v0-design.md` §6 remains authoritative for accounting rules. Posting and reversal must never be line-by-line browser requests and must re-validate inside the transaction. Convenience must not compromise integrity.

## 3. Technology stack

Same as Phase 2. No new framework.

- Next.js App Router (TS strict) + Tailwind + shadcn/ui (Base UI Button via `buttonVariants`) + TanStack Table
- `@supabase/ssr` against hosted `tdmcnbnyusxdegzopxhd`, `src/proxy.ts` exporting `proxy`
- `server-only` for `src/server/`, `decimal.js` via `src/lib/money.ts`, `Intl en-PH/Asia/Manila` via `src/lib/format.ts`
- Zod + `react-hook-form` + `@hookform/resolvers/zod`; `server/supabase/server.ts` + `requireOrganizationAction()` + `revalidatePath('/journal')` pattern reused from Phase 2
- No Prisma/Auth.js/Redux.

## 4. Required pages and routes

### `/journal`

- Filters: date range (start/end), status (`DRAFT`/`POSTED`/`REVERSED` multi), account (searchable), free text on `reference`/`description`; search is debounced.
- Columns: Entry Number (`JE-YYYY-XXXX` or `—`), Date (`formatBusinessDate`), Reference, Description, Status badge, Total (`formatPHP(total_debit)` == `total_credit` for balanced entries), Updated At.
- Row actions: **Open** (always), **Duplicate Draft** (creates new draft), **Post Draft** (only when `status=DRAFT`, confirm "Post entry JE-YYYY-XXXX? This cannot be undone."), **Reverse Posted** (only when `status=POSTED`, opens reversal dialog).
- TanStack table with sort on date/entry_number, empty state "No journal entries yet. Create your first draft."

### `/journal/new`

- Header form (react-hook-form + Zod + useActionState bridge to `upsertJournalEntry`): `entry_date` (date picker constrained to open periods, default today-in-open or first open start), `reference` (auto-suggested `JE-YYYY-next` preview fetched from `journal_entry_sequence.last_number+1`, still editable), `description`, `notes`.
- Line grid component (`src/components/journal/LineGrid.tsx`): rows with `AccountPicker` (combobox filtered to `is_active=true` ordered by `code`, searchable by code/name), `description` input, `debit`/`credit` numeric inputs (mutually exclusive — typing in one clears the other, `toDecimal` validated), `tax_code` optional text, Add/duplicate/remove buttons matching spec, hotkeys (Tab, Enter→new row, Esc, Up/Down).

### `/journal/[id]`

- When `status=DRAFT`: same header+grid as `/journal/new` in editable mode, with Save Draft (explicit) plus debounced auto-save on blur/change (same Server Action), Delete Draft (confirm), and Post (confirm → `postJournalEntry` action → RPC).
- When `status=POSTED|REVERSED`: read-only view of header+lines, totals, posted metadata, and the **Reverse** dialog trigger (POSTED only). No edit/delete inputs; badges and `Reversal of JE-…` link when applicable.

All routes are Server Components guarded by `requireOrganization()`; every mutation uses `requireOrganizationAction()`.

## 5. Data model

**Migrations already present (Phase 1):** `journal_entry` (nullable `entry_number bigint`, `unique (organization_id, entry_number)`, `status`, `entry_type`, `reversal_of_id`, `total_debit/credit numeric(19,4)`, `fiscal_period_id` FK) and `journal_line` (line_number, debit/credit, tax_code, account_id FK, checks `debit=0 xor credit=0` and `debit>0 or credit>0`).

**New in this phase:**

- `supabase/migrations/00010_sequences.sql` — `create table public.journal_entry_sequence (organization_id uuid primary key references public.organization(id) on delete cascade, last_number bigint not null default 0, updated_at timestamptz not null default now()); create trigger ...set_updated_at;` One row per org, created lazily (first post inserts `0` then `FOR UPDATE`).
- `supabase/migrations/00011_post_journal_entry.sql` — `create or replace function public.post_journal_entry(p_entry_id uuid) returns text language plpgsql security definer set search_path=public as $$ ... $$;` with `SELECT ... FOR UPDATE` on both `journal_entry` and `journal_entry_sequence`, membership check via `organization_membership` where `user_id=auth.uid()`, fiscal period lookup via `entry_date BETWEEN start_date AND end_date AND status='OPEN'`, and audit insert.
- `supabase/migrations/00012_reverse_journal_entry.sql` — `reverse_journal_entry(p_entry_id uuid, p_reversal_date date, p_description text default null) returns text` as above, reusing the posting sequence path.
- Additionally patch `00009_rls_policies.sql` gap: add `audit_event` insert policy `for insert with check (exists membership where organization_id = audit_event.organization_id)` or keep RPCs `SECURITY DEFINER` with documented justification.

RLS on `journal_entry`/`journal_line` already scope via org membership (00009); no structural change.

## 6. Business rules

Exactly per spec §6, enforced twice (inline Server Action for fast feedback + RPC re-check under lock):

- User is member of the entry's `organization_id`.
- `entry_date` lies in an OPEN `fiscal_period` for that org. Inline Server Action checks via `entry_date BETWEEN` and surfaces "Date not in any open period"; RPC re-checks after locking.
- At least two journal lines; every line references an `is_active=true` account; every line has exactly one positive amount (`debit` xor `credit`, neither negative, not both zero); `total_debit = total_credit` via `decimal.js`/`numeric` (`isBalanced`) and `>0`; required header fields present.
- Drafts may be edited/deleted; Posted/Reversed may not be edited/deleted via app or service (RPC and RLS prevent the transition; Server Actions 404/403 on `status<>DRAFT`).
- Closed-period entries may not be created, modified, posted, or reversed — the same ` fiscal_period` lookup fails when only `OPEN` rows are considered.
- `entry_number` is assigned only inside the posting RPC as formatted `JE-YYYY-XXXX` (text returned, stored as `bigint` suffix plus `YYYY` prefix kept as formatted string `reference`? Implementation: `entry_number` column stores the numeric suffix for uniqueness `unique (organization_id, entry_number)` where `entry_number` is the `last_number`; `reference` stores the formatted `JE-YYYY-XXXX` string for display. Alternative: store formatted as a separate `entry_number_text` derived column — spec §5 allows the repository to choose exact column names; the invariant is per-org uniqueness and sequential assignment. The spec's file structure lists `entry_number bigint` — so `entry_number bigint` holds the suffix; the formatted `JE-YYYY-XXXX` is stored in `reference` for display/search, assigned as `JE-<YYYY>-LPAD(last_number::text,4,'0')` at post time.
- No mutable account balances; no cached UI totals for reports (Phase 4 will compute from posted lines).

## 7. Import template

No new template in this phase (journal import is Phase 5). `templates/journal-entries.csv` remains the placeholder.

## 8. Seed data

No new seed accounts. Seed still provides V0 Accounting Demo + July 2026 OPEN + 6 accounts (via backfill). Phase 3 tests will create their own fiscal periods and journal entries under isolated orgs via service-role helpers and clean up in `afterAll`.

## 9. UX requirements

- Desktop-first, dense grid optimized for accountants; account picker searchable by code/name with keyboard nav; sticky footer totals always visible.
- Inline validation per field and per line; Post and Reverse buttons disabled until their predicates hold; confirm dialogs before posting/reversing; success/error toasts via `sonner`.
- Preserve entered Draft data when validation fails; loading, success, and error states for every mutation; no stack traces exposed.
- PHP formatting and `Asia/Manila` dates consistent with `lib/format.ts`.

## 10. Automated tests

- **Unit (`tests/unit/domain/journals.test.ts`, Vitest):** header Zod (reference/ description/ entry_date / lines min 2), per-line debit xor credit, `isBalanced` half-up rounding, entry_number formatting `JE-YYYY-XXXX` from YYYY + 4-digit pad, `canReverse` (only POSTED not already REVERSED), period resolution `entry_date → fiscal_period` open vs closed.
- **Integration (`tests/integration/journal-post.test.ts`, against hosted `skipIf`):** via service-role helpers and anon sign-in: balanced draft posts successfully and assigns formatted entry_number and sets `posted_by`; unbalanced/ single-line / inactive-account / closed-period post is rejected with mapped field errors; concurrent posts do not duplicate `entry_number` (two parallel `post` RPCs under `FOR UPDATE` yield distinct numbers); reversal swaps debits/credits correctly, links `reversal_of_id` both ways, original becomes REVERSED only after success; audit_event row written for each POST/REVERSE.
- **E2E (Playwright, prod `npm run start`):** extends `e2e/accounts.spec.ts` — `e2e/journal.spec.ts` covers sign-in → create balanced draft with 2 lines via keyboard (Tab+Enter) → Post → assert read-only (no edit inputs) → open `/journal` register confirms status/total → reverse with date picker → confirm nets correctly. Single-worker run to avoid `/auth/v1/token` rate-limit.

## 11. Implementation order

Four slices, each committed before the next:

- **Slice A — Draft CRUD + grid:** `lib/validation/journal.ts`, `server/domain/journals.ts`, `server/actions/journal-actions.upsertJournalEntry`, `components/journal/LineGrid.tsx` + `AccountPicker.tsx`, `/journal/new` + `/journal/[id]` editable.
- **Slice B — Sequence + posting RPC:** `supabase/migrations/00010_sequences.sql` + `00011_post_journal_entry.sql`, `server/actions/journal-actions.postJournalEntry` calling `supabase.rpc('post_journal_entry')`, posted read-only view, `JE-YYYY-XXXX` assignment.
- **Slice C — Reversal + audit:** `00012_reverse_journal_entry.sql`, `reverseJournalEntry` action + `ReverseDialog`, audit_event insert coverage.
- **Slice D — Register + filters + polish:** `/journal/page.tsx` register with date/status/account/text filters, Duplicate Draft, and final `typecheck && lint && build && vitest run && playwright --workers=1` sweep.

Each slice ends with `npm run typecheck && npm run lint && npm run build` and its slice's tests green before the next slice.

## 12. File structure deltas

```
D:\ERP\
├─ supabase/migrations/
│  ├─ 00010_sequences.sql
│  ├─ 00011_post_journal_entry.sql
│  └─ 00012_reverse_journal_entry.sql
├─ src/
│  ├─ lib/validation/journal.ts
│  ├─ server/domain/journals.ts
│  ├─ server/actions/journal-actions.ts          # upsert, post, reverse (RPC calls), duplicate, delete
│  ├─ components/journal/
│  │  ├─ JournalTable.tsx                         # register (TanStack)
│  │  ├─ JournalForm.tsx                          # shell hosting header + LineGrid
│  │  ├─ LineGrid.tsx                             # hotkey grid
│  │  ├─ AccountPicker.tsx                        # searchable active-only
│  │  ├─ PostConfirm.tsx
│  │  └─ ReverseDialog.tsx
│  └─ app/(app)/journal/
│     ├─ page.tsx                                  # register
│     ├─ new/page.tsx
│     └─ [id]/page.tsx                             # draft edit / posted read-only
├─ tests/
│  ├─ unit/domain/journals.test.ts
│  └─ integration/journal-post.test.ts
└─ e2e/journal.spec.ts
```

## 13. Locked decisions

1. **Reference auto-generated, complete format `JE-YYYY-XXXX`** with per-org `FOR UPDATE` counter (not simple integer), year from `entry_date`, suffix 4-digit padded; the numeric suffix is stored as `entry_number bigint` for the unique constraint, the formatted string in `reference`.
2. **Fiscal period double gate** — inline `entry_date BETWEEN` check in the draft Server Action for fast feedback plus re-check inside the posting/reversal RPC under lock.
3. **Audit metadata includes `line_count`** — `{ entry_number, total_debit, total_credit, line_count }`.
4. Full hotkeys and explicit Save Draft + debounced auto-save (Q2–Q3); reversal as a confirmed dialog with date picker on the posted page (Q4).
5. Server Actions for all journal mutations except the two RPCs (`post`/`reverse`); `importance: audit_event` insert covered by `SECURITY DEFINER` or an added insert RLS.

## 14. Out of scope

Nothing beyond §2 out-of-scope; reports and journal import remain Phase 4–5.
