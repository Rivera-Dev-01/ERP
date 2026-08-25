# Phase 2 — Accounting Master Data — Design Specification

Date: 2026-08-26
Status: Ready for review
Phase: 2 of 6 (Foundation shipped 2026-08-19)
Spec: Extends `docs/superpowers/specs/2026-08-19-erp-v0-design.md` §14

## 1. Objective

Deliver the master-data layer of the V0 accounting prototype on the hosted Supabase backend so the accountant can (a) maintain the pilot company's profile, (b) manage fiscal periods, and (c) operate the Chart of Accounts — searchable table, validated create/edit, deactivation with warning, and atomic CSV import — while the seeded demo dataset is backfilled for all downstream phases. Each of the three slices is independently runnable and keeps the app in a good state.

## 2. Scope

### Must include (this phase)

- **Slice 1 — Organization profile** at `/settings`: view all `Organization` fields read-only; edit only `name` + `legal_name` via a Zod-validated Server Action scoped to the member's `organization_id`. `currency_code`, `timezone`, `fiscal_year_start_month`, `tin`/`rdo`/`tax_classification` are displayed but not editable in V0.
- **Slice 2 — Fiscal periods** at `/settings/periods`: list periods in a TanStack table (name · start · end · status · closed_at); create new OPEN period (`name`, `start_date`, `end_date`); close an OPEN period through a confirmation dialog (sets `status=CLOSED`, `closed_at=now()`). No editing of dates after creation. Overlap is blocked by the existing `exclude using gist` constraint; `check (end_date >= start_date)` enforced. The seeded July 2026 OPEN period remains the demo fixture.
- **Slice 3 — Chart of Accounts** at `/accounts`: searchable TanStack table (Code · Account Name · Type · Normal Balance · Active, filterable on type/active); create/edit via dialog; deactivate by toggling `is_active` to false (no deletion) with a warning when the account has `journal_line` rows — "This account has N entries — deactivate anyway?" — still allowed, history retained for reports; atomic CSV-only import (`Account Code, Account Name, Account Type, Normal Balance, Active`) that validates every row before committing, shows all row-level errors when any row is invalid, and inserts nothing on failure; `import_batch` row for traceability; download template is the existing `templates/chart-of-accounts.csv`. Idempotently seed the 6 canonical accounts (1000/1100/3000/4000/5000/5100) into V0 Accounting Demo so `accounts` is no longer 0 rows.

### Explicitly out of scope (deferred)

- Any `journal_entry`/`journal_line` workflow, posting, reversal, audit events (Phase 3)
- Any report, export, or print layout (Phase 4)
- XLSX import, journal import, recurring templates, document attachments, BIR forms, subledgers, bank rec, inventory, payroll, fixed assets, multi-org switching in UI, mobile/OCR

### Source of truth

Spec `2026-08-19-erp-v0-design.md` §2–§8 remains authoritative. Accounting integrity over convenience. No silent scope expansion.

## 3. Technology stack

Identical to Phase 1, no new framework. Locked choices:

- Next.js App Router + TypeScript strict + Tailwind + shadcn/ui (Base UI `Button` via `buttonVariants`)
- TanStack Table for all three slice tables
- `@supabase/ssr` + `@supabase/supabase-js` against the hosted project (`tdmcnbnyusxdegzopxhd`, Seoul), with `src/proxy.ts` exporting `proxy` (Next 16 convention)
- `decimal.js` is not needed for Phase 2 (no money arithmetic yet), but `src/lib/money.ts` remains available
- `server-only` for every `src/server/` module; `src/lib/` stays client+server-safe
- Zod + `react-hook-form` + `@hookform/resolvers/zod` for validation; `papaparse` (or stdlib) for server-side CSV parsing inside a Server Action — **Approach A** (all mutations via Server Actions, CSV parsed and validated server-side, atomic commit). No Route Handler for import in this phase; body limit configured via `experimental.serverActions.bodySizeLimit` if needed.

## 4. Required pages and routes

### `/settings` (new, Slice 1)

- Header: organization name + legal_name subtitle (same pattern as `src/app/(app)/layout.tsx`)
- Read-only fields grid: `currency_code`, `timezone`, `fiscal_year_start_month`, `tin`, `rdo`, `tax_classification`
- Editable form card: `name` + `legal_name` (two text inputs, Zod trimmed 1–120 chars), Submit → Server Action `updateOrganization` → `revalidatePath('/settings')`. Success toast; field errors inline.

### `/settings/periods` (new, Slice 2; nested under `/settings`)

- TanStack table: Name, Start (formatted `Asia/Manila`), End, Status badge (OPEN/CLOSED), Closed At
- Actions: **New Period** button (dialog with name + start_date + end_date date pickers) → `createFiscalPeriod`; **Close** button on OPEN rows (confirm dialog) → `closeFiscalPeriod`
- Errors: overlap → "Period 2026-08-01–2026-08-31 overlaps July 2026 Test Period."; date order → inline.

### `/accounts` (existing route placeholder, now implemented, Slice 3)

- Searchable table: Code, Account Name, Type badge, Normal Balance badge, Active badge; search on code/name; filter on type/active
- Empty state: "No accounts yet. Create one or import the Chart of Accounts CSV."
- Actions: **New Account** (dialog), row **Edit** (dialog), row **Deactivate** toggle (confirm if journal_line count >0)
- **Import Accounts** button → file input (.csv) → Server Action `importAccountsCsv` → `ErrorPanel` (row · code · message) or success preview table; atomic: any error aborts, 0 inserts. Template download link to `templates/chart-of-accounts.csv`

Every authenticated route is guarded by `requireOrganization()`; every mutation uses `requireOrganizationAction()`.

## 5. Data model

No new migrations. Phase 2 reuses tables and RLS from Phase 1:

- `organization` (id, name, legal_name, currency_code, timezone, fiscal_year_start_month, tin, rdo, tax_classification, created_at, updated_at)
- `fiscal_period` (id, organization_id, name, start_date, end_date, status, closed_at) — `exclude using gist` + `check (end_date >= start_date)` + `unique (organization_id, name)`
- `account` (id, organization_id, code, name, type, normal_balance, is_active, created_at, updated_at) — `unique (organization_id, code)` + `account_org_idx`
- `import_batch` (id, organization_id, file_name, import_type, status, row_count, valid_row_count, invalid_row_count, created_by_id) — used with `import_type=CHART_OF_ACCOUNTS`

All three tables are already RLS-enabled with `*_select_org` / `*_insert_org` / `*_update_org` policies scoped via `organization_membership`. Mutations additionally enforce server-side `organization_id === ctx.organization.id` (never trust client-supplied org id).

## 6. Business rules

- **Organization:** exactly one visible org per V0 interface; edits are `name`/`legal_name` only; server rejects any other field. `updateOrganization` re-checks membership before writing.
- **Fiscal period:** `end_date >= start_date`; overlapping ranges per org rejected by DB; closing is one-way (no reopen in V0); `closed_at` is server timestamp at close; Phase 3 will block postings whose `entry_date` falls in a CLOSED period.
- **Account code:** numeric-only `^\d+$`, 1–20 chars, trimmed, `unique (organization_id, code)` at DB level maps to friendly "Code 1000 already exists" field error. Codes are treated as strings (preserve leading zeros).
- **Normal balance:** user-selectable DEBIT/CREDIT (no hard coupling to `type`); UI shows soft hint "ASSET typically DEBIT" but accepts any combination.
- **Deactivation:** no delete. Toggling `is_active=false` when `journal_line.account_id` count >0 requires the "N entries use this — deactivate anyway?" dialog; after deactivation the account is hidden from future journal line pickers (Phase 3) but remains included in historical report calculations via its posted lines.
- **CSV import:** header must be `Account Code,Account Name,Account Type,Normal Balance,Active` (case-insensitive, trimmed; order matters only if mapping is later added — for V0 we require this exact header). Per-row Zod as for single-account; within-file duplicate codes flagged; cross-file duplicates checked with a single `select code where organization_id=? and code in (...)`. All row errors collected; insert happens only when `invalidRowCount===0`. File insertion and `import_batch` row are committed together; a race duplicate at insert time surfaces as a form-level retry message.

## 7. Import template

`templates/chart-of-accounts.csv` is the canonical template (already committed):

```
Account Code,Account Name,Account Type,Normal Balance,Active
1000,Cash in Bank,ASSET,DEBIT,true
1100,Accounts Receivable,ASSET,DEBIT,true
3000,Owner's Capital,EQUITY,CREDIT,true
4000,Service Revenue,INCOME,CREDIT,true
5000,Office Supplies Expense,EXPENSE,DEBIT,true
5100,Utilities Expense,EXPENSE,DEBIT,true
```

`true/false` accepts `TRUE/true/True/1/0` coercion. Download link renders via `next/link` to the static file.

## 8. Seed data (Phase 2 backfill)

Phase 1 seed created `organization 22222222-2222-2222-2222-222222222222` and fiscal period `July 2026 Test Period` but 0 accounts. Phase 2 backfills idempotently on first successful load of `/accounts` (or via a one-time Server Action `seedDemoAccounts` guarded by org check): upsert the 6 rows above with `on conflict (organization_id, code) do update set name=excluded.name, type=excluded.type, normal_balance=excluded.normal_balance, is_active=true` so hosted DBs with 0 accounts become consistent without duplicating on re-run.

## 9. UX requirements

- Desktop-first, responsive for tablet; reuse Phase 1 shell (Sidebar + header with `legal_name`); `/settings` is nested under the app layout, so nav highlights correctly
- Forms use `react-hook-form` + Zod with inline field messages; preserve Draft form data on validation error; disable Submit while pending; success/error toasts via `sonner`
- TanStack tables support sort, search, and empty states explaining the next action
- Confirmation dialogs before close-period and deactivate-with-lines
- PHP formatting and `Asia/Manila` business dates (already in `lib/format.ts`)
- Loading states per mutation; no stack traces or DB details exposed

## 10. Automated tests

- **Unit (`tests/unit/domain/`, Vitest):** `accounts.test.ts` (code regex, name/type/normal_balance enums, within-file duplicate helper); `fiscal-periods.test.ts` (date ordering, overlap predicate, OPEN→CLOSED transition); `coa-import.test.ts` (header normalization, Active coercion, row-error collection)
- **Integration (`tests/integration/`, against hosted, `skipIf` no env):** org update scoping; fiscal period create/overlap/close; account CRUD, duplicate within org rejected, deactivation with and without journal lines, CSV valid 6-row import (6 accounts + import_batch counts), CSV invalid (duplicate + bad type) returns row errors and inserts 0. RLS suite from Phase 1 keeps passing.
- **E2E (Playwright, prod `npm run start`, 4→7 tests):** sign-in → `/settings` edit legal_name → `/settings/periods` create August 2026 + close → `/accounts` empty → create 1000 Cash → table shows it → edit name → import valid CSV → 6 rows appear → import invalid CSV → error panel shows.

## 11. Implementation order

Three slices, each committed before the next:

- **Slice 1 — Organization:** `domain/organization` Zod, `organization-actions.updateOrganization`, `/settings` page + `OrgProfileForm`
- **Slice 2 — Fiscal periods:** `domain/fiscal-periods`, `period-actions` (create/close), `/settings/periods` table + dialogs
- **Slice 3 — Chart of Accounts + import:** `domain/accounts`, `account-actions` (create/update/deactivate), `server/imports/parser.ts` + `coa-import.ts`, `/accounts` table + dialogs + `CsvUpload`/`ErrorPanel`, seed backfill, template download

Each slice ends with `npm run typecheck && npm run lint && npm run build`, `npx vitest run`, and `npm run test:e2e` as applicable before the next slice.

## 12. File structure deltas

```
D:\ERP\
├─ CONTEXT.md                              # new — Phase 2 glossary
├─ templates/chart-of-accounts.csv         # already exists
├─ src/
│  ├─ app/(app)/
│  │  ├─ settings/page.tsx                # Slice 1
│  │  ├─ settings/periods/page.tsx        # Slice 2
│  │  └─ accounts/page.tsx                # Slice 3
│  ├─ components/
│  │  ├─ settings/OrgProfileForm.tsx
│  │  ├─ periods/PeriodTable.tsx + PeriodForm.tsx + CloseConfirm.tsx
│  │  ├─ accounts/AccountsTable.tsx + AccountForm.tsx + DeactivateConfirm.tsx
│  │  └─ imports/CsvUpload.tsx + ErrorPanel.tsx
│  ├─ server/
│  │  ├─ domain/accounts.ts
│  │  ├─ domain/fiscal-periods.ts
│  │  ├─ actions/organization-actions.ts
│  │  ├─ actions/period-actions.ts
│  │  ├─ actions/account-actions.ts
│  │  └─ imports/parser.ts + coa-import.ts
│  └─ lib/constants.ts                     # account_type / normal_balance option arrays (if not already)
├─ tests/
│  ├─ unit/domain/accounts.test.ts
│  ├─ unit/domain/fiscal-periods.test.ts
│  ├─ unit/domain/coa-import.test.ts
│  ├─ integration/organization.test.ts
│  ├─ integration/fiscal-period.test.ts
│  ├─ integration/account.test.ts
│  └─ integration/coa-import.test.ts
└─ e2e/accounts.spec.ts
```

## 13. Locked decisions

1. Server Actions for all Phase 2 mutations (no Route Handler); CSV parsed server-side, atomic validate-then-insert (Approach A, Section 1).
2. Nested `/settings` → `/settings/periods` routing (Section 1).
3. No new migrations; Phase 2 reuses existing `organization`/`fiscal_period`/`account`/`import_batch` tables and RLS (hosted, `supabase db push` already applied).
4. Numeric-only `code`, user-selectable `normal_balance`, inline friendly errors (Q4); warn-then-allow deactivation (Q5); CSV-only atomic import (Q6).

## 14. Out of scope

Nothing beyond §2 "Out of scope" — in particular no journal posting, no reports, no XLSX, no reopen of periods.
