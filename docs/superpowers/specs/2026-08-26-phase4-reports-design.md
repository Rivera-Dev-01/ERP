# Phase 4 — Reports — Design Specification

Date: 2026-08-26
Status: Ready for review
Phase: 4 of 6 (Phase 3 journal engine shipped 2026-08-26)
Spec: Extends `docs/superpowers/specs/2026-08-19-erp-v0-design.md` §8 and `2026-08-26-phase3-journal-engine-design.md`

## 1. Objective

Deliver the five V0 financial reports so that the accountant can verify accounting integrity against the Excel workbook — each report reading only `POSTED` (and `REVERSED`-original) lines on the fly, with the same shared `posted lines → balances` engine, under `Asia/Manila` business dates and `en-PH` PHP formatting, plus CSV + XLSX export and a print view. The seeded demo must match the exact §10 fixture every time.

## 2. Scope

### Must include (this phase)

- **Shared engine `src/server/reports/balances.ts`** deriving per-account opening / period / ending from `journal_line JOIN journal_entry` where `organization_id` + `status IN ('POSTED','REVERSED')` (the `REVERSED` original's lines remain visible and net with its swapped `REVERSAL` — per §11) + inclusive `entry_date BETWEEN from AND to` (and `entry_date < from` for opening, `<= to` for Balance Sheet as-of). Normal-balance branching: `ASSET/EXPENSE: debits-credits`, `LIABILITY/EQUITY/INCOME: credits-debits`; magnitudes via `decimal.js` + `toDbString` / `isBalanced`, never float; rounding half-up (`MONEY_SCALE 4`). **No stored balances, no materialized view** — calculation on the fly so reports cannot drift (§5).
- **SQL seed of the 5-entry §10 fixture for the demo** (so `/reports/*` shows `120000` halves without manual posting) — inserts the 5 entries with `status='POSTED'`, `entry_number` `JE-2026-0001..0005`, `fiscal_period_id` July 2026 OPEN, and bumps `journal_entry_sequence.last_number` to 5 (idempotent `on conflict`).
- **Five pages under `src/app/(app)/reports/`**, each a Server Component guarded by `requireOrganization()` that reads `searchParams`:
  - `general-journal` — chronological line stream; fields Entry Number (`JE-YYYY-XXXX` or `—`), Date, Reference, Description, Account code — name, Debit, Credit, Status; default `status=POSTED` only, toggle to include `DRAFT` (only report where Draft appears).
  - `general-ledger` — per-account opening balance before `from`, then period lines ordered `entry_date, entry_number`, running balance via opening + cumulative period delta, ending balance.
  - `trial-balance` — one row per account with opening *or* period activity: Code, Name, Opening debit/credit, Period debit, Period credit, Ending debit/credit; footer `Total Ending Debits = Total Ending Credits` and the numeric check.
  - `income-statement` — selected period `Income = Credits-Debits` for `INCOME`, `Expenses = Debits-Credits` for `EXPENSE`, `Net Income = Income - Expenses`, grouped by `type`.
  - `balance-sheet` — as-of `to` date `Assets = Debits-Credits` (ASSET), `Liabilities = Credits-Debits`, `Equity = Credits-Debits`, `Current Earnings = Income-Expenses through to`, and `Assets = Liabilities+Equity+CurrentEarnings` check (never hide imbalance).
- **Filters on every page via `src/components/reports/FilterBar.tsx`**: `from`/`to` date range (inclusive `BETWEEN`, defaulting to the OPEN July 2026 period’s `start_date`/`end_date` when empty), plus **full-parity** account multi-select (including inactive historic accounts — deactivated accounts stay in reports per §6) on Trial/Income/Balance and single-account on Ledger, and `status` visibility on Journal. URL-shareable (`useSearchParams` + debounced `router.push`), and every filter chip appears in the printed header.
- **UX shell `src/components/reports/`**: `ReportHeader.tsx` (company `name` + `legal_name`, report title, `Period: from – to` or `As of`, generated `Asia/Manila` timestamp via `Intl.DateTimeFormat`, filter summary), `ReportTable.tsx` (TanStack, sorted, empty "No entries", `formatPHP` / `formatBusinessDate`, `—` for zero, running-balance column on Ledger), `PrintLayout.tsx` (`@media print` hiding `FilterBar`/`Sidebar`, `window.print()` button — no separate `/print` route for V0).
- **Binary export `src/app/api/export/[report]/route.ts` + `src/server/imports/export.ts`**: `GET ?format=csv|xlsx&from=&to=&account=&status=&q=` reuses the *same* guard + `getBalances`/per-report predicate as its page; `requireOrganization()` (`401` generic `Not authorized` when unauthenticated); `Content-Type` `text/csv; charset=utf-8` (via `papaparse.unparse`) or `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` (via `exceljs` `Workbook.xlsx.writeBuffer()` with bold header row `fill f2f2f2`, PHP numbers as `formatPHP` text, balance-check row); `Content-Disposition: attachment; filename="<Report>-<from>_to_<to>-<YYYY-MM-DD>.csv|xlsx"` (date `Asia/Manila`); never expose stack.

### Explicitly out of scope (deferred)

- Journal import / XLSX CoA import beyond the existing `templates/chart-of-accounts.csv` download — Phase 5.
- BIR forms, subledgers, bank rec, inventory, payroll, fixed assets, multi-org switching in UI, mobile, OCR.
- Materialized balances, cached totals, or `report_balances` table — reports remain derived.

### Source of truth

`2026-08-19-erp-v0-design.md` §8 and §10 are authoritative for report math and the `120000 / 12000 / 112000` fixture; convenience never overrides `status`, inclusive boundaries, or exact decimal arithmetic.

## 3. Technology stack

Same as Phases 2–3, plus `exceljs` for XLSX. No new framework.

- Next.js App Router (TS strict) + Tailwind + shadcn/ui (Base UI `Select`/`Dialog`/`Badge`) + TanStack Table + `@supabase/ssr` (hosted `tdmcnbnyusxdegzopxhd`, `src/proxy.ts` `proxy`) + `server-only` for `src/server/`, `decimal.js` + `Intl en-PH/Asia/Manila` (`lib/money.ts`/`lib/format.ts`) + Zod only where report filters are validated, `papaparse` for CSV, `exceljs` for XLSX.
- Migrations already provide `journal_entry_sequence`, `post`/`reverse` RPCs, `JE-YYYY-XXXX`; no new migration except the 5-entry demo seed (idempotent).

## 4. Required pages and routes

All report pages are `async` Server Components at `src/app/(app)/reports/*` reading `searchParams: Promise<Record<string,string|undefined>>` (Next 16 `searchParams` Promise; `await` it). Every fetch is `eq('organization_id', org.id)` + `status IN ('POSTED','REVERSED')` except Journal’s Draft opt-in where it becomes `status IN ('POSTED','REVERSED','DRAFT')` when `status` param includes `DRAFT`; ledger’s opening uses `entry_date < from`.

### `/reports/general-journal`

- Filters: `from`/`to` + `status` toggle (Posted — default — vs Draft-included) + `account` (single) + `q` (reference/description `ilike`).
- Columns: Entry Number, Date, Reference, Description, Account code — name, Debit, Credit, Status. Ordered `entry_date ASC, entry_number ASC`.

### `/reports/general-ledger`

- Filters: `from`/`to` + required `account` (single, incl. inactive historic; if none selected, prompt "Select an account" empty state, not all accounts).
- Columns: Date, Entry Number, Reference, Description, Debit, Credit, Running Balance (via `opening + cumulative period`; `formatPHP` + side DEBIT/CREDIT badge).
- Data: `getBalances` for opening (`< from`), then period lines `BETWEEN from AND to` inclusive for the running walk.

### `/reports/trial-balance`

- Filters: `from`/`to` + `account` multi-select (comma-joined, incl. inactive) — when `account` param present, `in('id', ids)`.
- Columns: Code, Name, Opening debit, Opening credit, Period debit, Period credit, Ending debit, Ending credit.
- Footer: `Total Ending Debits = Total Ending Credits` numeric check (`₱120,000.00 = ₱120,000.00` in the fixture; `isBalanced`-derived) as a `Badge`/`Callout`.

### `/reports/income-statement`

- Filters: `from`/`to` + `account` multi-select (still incl. inactive, but `type` restricts to INCOME/EXPENSE for totals).
- Grouped rows: `INCOME` accounts (`credits-debits` each) + Σ Income, `EXPENSE` accounts (`debits-credits`) + Σ Expenses, `Net Income = Σ Income - Σ Expenses`. For the July fixture: Income `20000`, Expenses `8000`, Net `12000`.

### `/reports/balance-sheet`

- Filters: single `to` (as-of inclusive `entry_date <= to`; `from` ignored) + `account` multi-select (incl. inactive). Defaults `to` to OPEN period `end_date`.
- Sections: `ASSET` (`debits-credits` each) Σ Assets, `LIABILITY`/`EQUITY` (`credits-debits`) Σ, `Current Earnings` as `Income - Expenses` through `to` (computed via `income-statement` totals through `to`), check `Assets = Liabilities+Equity+CurrentEarnings` (`112000 = 0 + 100000 + 12000` in the fixture; never hide imbalance).

Every page composes `ReportHeader` + `FilterBar` + `ReportTable` inside `PrintLayout` (with a `Print` button calling `window.print()`).

## 5. Data model

No stored balances. Phase 4 reads (joins shown for the engine):
- `journal_entry` (`organization_id`, `fiscal_period_id`, `entry_number bigint` suffix for uniqueness `unique(organization_id, entry_number)`, `reference` formatted `JE-YYYY-XXXX`, `entry_date date`, `status DRAFT/POSTED/REVERSED`, `entry_type`, `reversal_of_id`, `total_debit/credit numeric(19,4)`, `created_by_id/posted_by_id`, indexes `(organization_id, entry_date)` + `(organization_id, status)`) + `journal_line` (`journal_entry_id FK cascade, account_id FK, line_number, description, debit/credit numeric(19,4) with `check (debit=0 or credit=0)` and `debit>0 or credit>0`, `tax_code`).
- `account` (`type`, `normal_balance`, `is_active`) — reports include inactive historic when referenced by `journal_line`, even though the ledger picker only offers `is_active=true` for new entries; Trial/Balance `account` multi-select `in` includes inactive ids when present in `journal_line`.
- `fiscal_period` (`status OPEN/CLOSED`, `exclude using gist` overlap) — period defaults to the OPEN July 2026.
- `organization` + `organization_membership` — scoping via RLS + `requireOrganization()`.
- Demo seed rows: 5 entries (Owner investment 100000, Supplies 5000, Service on account 20000, Collection 10000, Utilities 3000) as `status='POSTED'`, `entry_number` 1..5, `reference` `JE-2026-0001..0005`, inserted idempotently with `on conflict (organization_id, entry_number) do update` and `journal_entry_sequence.last_number` bumped to 5.

## 6. Business rules

Exactly per §8–§11, enforced by the engine and re-checked in tests:
- All financial reports use `POSTED` only in `from`/`to` ranges, plus `REVERSED` originals (both the `REVERSED` original and its swapped `REVERSAL POSTED` remain visible and net correctly); `DRAFT` is excluded except on General Journal when `status` explicitly includes `DRAFT`.
- Inclusive boundaries: `entry_date BETWEEN from AND to`, as-of `entry_date <= to`, with fixtures on `2026-07-01` and `2026-07-31` required to be included and `2026-06-30`/`2026-08-01` required to be excluded.
- Per-`normal_balance` branching is the only balance rule; `type` does not override it. `isBalanced` half-up rounding (`MONEY_SCALE 4`, `ROUND_HALF_UP`) is the trial invariant.
- Reversed activity nets zero but remains visible; `REVERSED` status is not hidden.
- No `GET /api/export/*` ever bypasses `requireOrganization()` and the same `getBalances` predicate as its page — CSV and XLSX for the same `from`/`to`/`account` must byte-differ but value-match.

## 7. Import / export templates

No new CSV import template (Phase 5). Export filenames are `Content-Disposition` values: `<ReportTitle>-<from>_to_<to>-<generated-YYYY-MM-DD>.<ext>` (generated date `Asia/Manila`). The existing `templates/chart-of-accounts.csv` remains the only downloadable template; report exports are ephemeral downloads, not persisted `import_batch` rows.

## 8. Seed data

Phase 3 left `journal_entry_sequence` per org. Phase 4 adds an idempotent seed for the demo org `22222222-2222-2222-2222-222222222222`: if `journal_entry` count where `org` and `entry_number IN (1..5)` is `0`, insert the 5 §10 entries as `POSTED` (with `posted_by_id` the demo accountant `11111111-1111-1111-1111-111111111111`, `posted_at now()`, `fiscal_period_id` July 2026), lines as spec’d with `line_number`, `debit=0 xor credit=0`), and `upsert journal_entry_sequence (organization_id, last_number) values (demoOrg, 5) on conflict (organization_id) do update set last_number = greatest(excluded.last_number, journal_entry_sequence.last_number)`. Rerun is idempotent. Integration tests use an isolated random org (per `tests/integration/journal-draft.test.ts` pattern) and either insert directly or post via `post_journal_entry` RPC — both are exercised; at least one suite posts via RPC to prove the sequence path.

## 9. UX requirements

- Desktop-first; report tables are `overflow-x-auto`, header row `bg-muted/50`, money right-aligned via `formatPHP`, dates via `formatBusinessDate`; `—` for zero/missing.
- `ReportHeader` shows company `name` + `legal_name`, report title, `Period: from – to` or `As of`, generated `Asia/Manila` timestamp, and a filter-summary chip row (inclusive boundaries noted).
- `FilterBar` is client, debounced `router.push` to keep URL shareable; period defaults to the OPEN July 2026 when `from`/`to` absent; ledger’s account picker includes inactive historic (disabled styling but selectable for history), while the journal entry picker (Phase 3) stays active-only.
- `PrintLayout` hides `FilterBar`/`Sidebar` on `@media print`, keeps `ReportHeader`/`ReportTable` + balance checks; `Print` button calls `window.print()`; no separate `/print` route for V0.
- Loading state per report is the Server Component streaming fallback (skeleton rows); errors are generic `Not authorized` / `Unable to load report` toasts — never stack traces.

## 10. Automated tests

- **Unit (`tests/unit/reports/balances.test.ts`, Vitest):** `normal_balance` branching (ASSET/EXPENSE `debits-credits` vs LIABILITY/EQUITY/INCOME `credits-debits`), opening = sum before `from`, period = `BETWEEN from AND to` inclusive, as-of `<= to`, half-up rounding edge `toDbString('0.00005')→'0.0001'`, and the `isBalanced` trial invariant.
- **Integration (`tests/integration/reports/*`, `skipIf(!available)`, hosted via `service_role` isolated org+user+period+accounts — same fixture as §10 — per `tests/integration/journal-draft.test.ts:99-116` reverse-FK `afterAll` cleanup):**
  - `trial-balance.test.ts` — asserts `₱120,000.00` halves and per-account endings (Cash 102000 D etc.).
  - `income-statement.test.ts` — asserts `Income 20000`, `Expenses 8000`, `Net 12000` grouped.
  - `balance-sheet.test.ts` — asserts `Assets 112000 = L+E+CurrentEarnings 112000` with the balance check never hidden; also `to` as-of semantics (`asOf = 2026-07-15` partial vs `2026-07-31` full).
  - `general-ledger.test.ts` — opening before `from` = sum `< from`, running balance via `opening + cumulative period` ordered `entry_date, entry_number`.
  - Each suite also covers: **Draft excluded** (insert a DRAFT 5000 entry → totals unchanged, except Journal when `status` includes DRAFT → row appears), **Reversed nets zero** (`reverse_journal_entry` on 2026-07-16 → still `120000`/`12000`/`112000` and reversal row visible), **Boundary inclusive** (`2026-07-01` and `2026-07-31` included, `2026-06-30`/`2026-08-01` excluded).
  - At least one suite posts its fixture via `supabase.rpc('post_journal_entry')` (proving the sequence) rather than direct `status='POSTED'` inserts.
- **E2E (`e2e/reports.spec.ts`, `workers=1`, `describe.serial`, `test.setTimeout(60_000)` as in `e2e/journal.spec.ts`, `signIn` from `e2e/support/helpers.ts`):** `signIn` → visit Trial / Income / Balance and assert `120000` / `12000` / `112000` halves (via `getByText` with `₱` formatting, tolerant of either `₱` or `PHP` rendering), then `create draft → post → Trial delta +₱100` → `reverse → net zero` → `Export CSV` via `page.waitForEvent('download')` then `papaparse` header+row check and `Export XLSX` via `exceljs` `Workbook.xlsx.load` on the downloaded buffer (bold header + `formatPHP` cell text + balance-check row); print check via `page.emulateMedia({media:'print'})` + `ReportHeader` visibility.

## 11. Implementation order

Four slices, each committed before the next:

- **Slice 09 — Shared engine + demo seed.** Unit on `balances.ts` + SQL seed of the 5 §10 entries for the demo (bumping `journal_entry_sequence`).
- **Slice 10 — General Journal + General Ledger.** Line stream vs per-account running balance with inclusive date/account/status filters.
- **Slice 11 — Trial Balance + Income Statement + Balance Sheet.** Trial halves + Income groups + Balance as-of, all calling the shared engine.
- **Slice 12 — Export route + PrintLayout + E2E polish.** `api/export/[report]` both formats, `PrintLayout` (`@media print`), ids `1.2.3` E2E download/print pass, plus `exceljs` dep, `CONTEXT`/`README` updates.

Each slice ends with `npm run typecheck && npm run lint && npm run build` and its slice’s `npx vitest run` + applicable `npx playwright test --workers=1` green before the next slice.

## 12. File structure deltas

```
D:\ERP\
├─ supabase/              # seed extension for the 5 demo entries (idempotent)
├─ src/
│  ├─ server/reports/
│  │  ├─ balances.ts       # shared getBalances + NormalBalance branching
│  │  ├─ general-journal.ts
│  │  ├─ general-ledger.ts
│  │  ├─ trial-balance.ts
│  │  ├─ income-statement.ts
│  │  └─ balance-sheet.ts
│  ├─ server/imports/export.ts  # papaparse + exceljs builders
│  ├─ app/(app)/reports/
│  │  ├─ general-journal/page.tsx
│  │  ├─ general-ledger/page.tsx
│  │  ├─ trial-balance/page.tsx
│  │  ├─ income-statement/page.tsx
│  │  └─ balance-sheet/page.tsx
│  ├─ app/api/export/[report]/route.ts  # GET ?format=csv|xlsx&from=&to=&account=&status=
│  └─ components/reports/
│     ├─ ReportHeader.tsx
│     ├─ FilterBar.tsx
│     ├─ ReportTable.tsx
│     └─ PrintLayout.tsx
├─ tests/
│  ├─ unit/reports/balances.test.ts
│  ├─ integration/reports/{trial-balance,income-statement,balance-sheet,general-ledger}.test.ts
│  └─ e2e/reports.spec.ts
└─ package.json            # + exceljs
```

## 13. Locked decisions

1. **Seed via SQL** for the demo org (idempotent upsert + sequence bump), so reports show §10 fixture without manual posting.
2. **Full-parity filters** — date range inclusive on every report; Ledger single account incl. inactive historic; Trial/Income/Balance account multi-select incl. inactive; Journal status toggle (Posted default vs Draft-included).
3. **Full standard exports + print** — CSV (`papaparse`) + XLSX (`exceljs` `Workbook` bold header + `formatPHP` text + balance-check row) from a single `GET /api/export/[report]` reusing the page’s predicate, plus `PrintLayout` (`@media print`, `window.print()`).
4. **Approach A — shared `balances.ts` engine** — one derived-balances source for all 5 reports, `decimal.js` half-up, inclusive `BETWEEN`.
5. **No stored balances / no materialized view** — reports cannot drift (§5).

## 14. Out of scope

Nothing beyond §2 out-of-scope; journal import beyond CoA CSV, recurring, attachments, BIR, subledgers remain Phase 5+.
