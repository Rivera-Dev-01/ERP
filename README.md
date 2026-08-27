# ERP V0 — Accounting Prototype

Desktop-first accounting prototype: per-Company journal entries, posting, reversal, and five per-Company financial reports that must match an existing Excel workbook. **Stack** Next.js 16 (App Router, TypeScript strict) + Supabase (Postgres, Auth, RLS) + TanStack Table + decimal.js. Spec: `docs/superpowers/specs/2026-08-19-erp-v0-design.md`; Companies extension: `docs/superpowers/specs/2026-08-27-companies-design.md`.

## Prerequisites

- Node.js >= 20 (tested 24.19.0) + npm
- A hosted Supabase company (Seoul `tdmcnbnyusxdegzopxhd` for staging) or local CLI
- Git

## Local setup

```bash
npm install
cp .env.example .env        # then fill in your hosted company's URL and keys
```

Get the values from your Supabase company dashboard (Settings → API) or via the CLI:

```bash
npx supabase login
npx supabase projects api-keys --company-ref--company-ref--project-ref <company-ref>
```

Apply the schema migrations to your hosted company:

```bash
npx supabase link --company-ref--company-ref--project-ref <company-ref>
npx supabase db push
```

Apply the seed data once from the dashboard: open `supabase/seed.sql`, paste it into the SQL Editor, and run it (idempotent — re-running is safe). The post-seed fix `00014` repairs `JE-TEST-001` pollution and bumps the per-org sequence to 5.

Run the app:

```bash
npm run dev          # http://localhost:3000
npm run build && npm run start  # production standalone (Docker: next.config.ts output: 'standalone')
```

Sign in with the seeded accountant (see `supabase/seed.sql` + `supabase/migrations/00002`):

- **Email:** `accountant@v0.local`
- **Password:** `demo-pass-123` (seeded via `auth.users`, password hash via Supabase Auth; app never handles hashes)
- **Org:** `V0 Accounting Demo` `22222222-2222-2222-2222-222222222222` — one `ACCOUNTANT` membership, `Asia/Manila`, `PHP`.

For integration tests, copy `.env.test.example` → `.env.test` with `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` + service_role anon key for RLS tests.

## Database commands

```bash
npx supabase db push                    # apply pending migrations to the linked company
npx supabase gen types typescript --linked > src/types/database.ts  # regenerate types (then patch Insert company_id? -> string for trigger compat if needed)
cmd /c "npx.cmd supabase gen types typescript --linked > src/types/database.ts"
```

`supabase db reset` is only for the local stack; on hosted, schema changes ship as new migrations (`supabase/migrations/00001..00021`).

## Tests

```bash
npm test                               # unit + integration (RLS needs .env.test, skipIf without keys)
npm run test:e2e                       # Playwright (needs production build + dev server: npm run build first, then npx playwright test --workers=1)
npm run typecheck && npm run lint && npm run build  # full verification before push (PM gate)
```

Hosted DB is used for integration: `tests/integration/reports/*` assert `120000` Trial halves, `12000` Income net, `112000` Balance assets; `tests/integration/companies.test.ts` per-Company code/period isolation; `tests/integration/journal-draft.test.ts` post/reverse + `audit_event` line_count.

## Lint, types, and build

```bash
npm run lint       # eslint (may be slow on full scan)
npm run typecheck  # tsc --noEmit
npm run build      # next build (Turbopack, optimizePackageImports + staleTimes)
```

## Deployment

The app is a standard Next.js standalone build; `Dockerfile` is included:

```bash
docker build -t erp-v0 .
docker run -p 3000:3000 -e NEXT_PUBLIC_SUPABASE_URL=... -e NEXT_PUBLIC_SUPABASE_ANON_KEY=... erp-v0
```

For managed hosting (Vercel/Render/Fly), connect the repo and set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server-only), `NEXT_PUBLIC_SITE_URL` from your hosted Supabase company. Middleware (`src/proxy.ts`) refreshes sessions; `output: 'standalone'` is set in `next.config.ts`.

## Security notes

- The service-role key (`SUPABASE_SERVICE_ROLE_KEY`) is server-only. Never prefix with `NEXT_PUBLIC_`.
- All organization- and company-owned tables are protected by PostgreSQL Row-Level Security plus server-side `requireOrganization()` / `requireCompany()` checks on every query/mutation/RPC.
- Secrets are never committed. Only `.env.example` and `.env.test.example` are tracked.

## What’s in Phase 2

- **Organization profile** at `/settings` — edit `name` + `legal_name`, other fields read-only.
- **Fiscal periods** at `/settings/periods?company=<id>` — per-Company list, create OPEN period, close with confirmation; overlap blocked by per-Company `exclude gist (company_id, daterange)` (`00015` + `00017`).
- **Chart of Accounts** at `/accounts?company=<id>` — per-Company TanStack table (Code · Name · Type · Normal Balance · Active), validated create/edit, deactivation with “N journal lines use this” warning, and atomic **CSV/XLSX** import (`templates/chart-of-accounts.csv` template, `parseTabular` via papaparse/exceljs). Code unique per Company `(company_id,code)` (`00015`). Fresh companies start 0 rows; Example Client seeded 6 canonical accounts via `00013` backfilled to Example Client.

## What’s in Phase 3

- **Journal** — `/journal?company=<id>` filterable by date/status/account/free text; `/journal/new?company=<id>` and `/journal/[id]?company=<id>`: header (`entry_date` in OPEN period, `reference` 1–60, `description` 1–200) + line grid (Account picker active per Company, Description, Debit xor Credit, Tax code; **Enter** advances cell→next row (auto-append), **Shift+Enter** back, **ArrowUp/Down** same column; sticky footer **Total Debit / Total Credit / Difference** via `sumLineAmounts` + `decimal.js`, Post disabled until balanced + ≥2 lines; `isBalanced` via `decimal.js`).
- **Draft lifecycle** — Save Draft (validated Server Action, resolves `fiscal_period_id` via `BETWEEN` on OPEN period per Company, computes totals with `toDbString`) + Duplicate (`-copy`) and Delete (DRAFT-only).
- **Posting** — `post_journal_entry` RPC (`SECURITY DEFINER`, `FOR UPDATE` on `journal_entry_sequence` per-org) assigns `JE-YYYY-XXXX` (`YYYY` from `entry_date`, `XXXX` zero-padded `last_number+1`), sets `POSTED`/`posted_at`, writes `audit_event`; read-only view shows `JE-YYYY-XXXX`, Posted badge, no edit inputs.
- **Reversal** — on POSTED: **Reverse** dialog with date picker (must be in OPEN period) and swapped-lines preview (`debit↔credit`); `reverse_journal_entry` RPC creates `REVERSAL` entry (`Reversal of …`) and marks original `REVERSED`.
- **Numbering** — `JE-YYYY-XXXX` per `organization_id` via trigger `00019/00020` default `company_id` fallback; journal import groups validated via `journal-import.ts` (Entry Group ≥2, `YYYY-MM-DD` in OPEN per Company, active account, balanced).

## What’s in Phase 4 — Reports (per-Company)

All five reports are **per-Company** (`?company=<uuid>` flat, `CompanySwitcher` shows `name — client_name`, canonical `307` redirect, `withCompany` preserves `?company=`). Shared engine `src/server/reports/balances.ts` (`computeBalance` half-up `MONEY_SCALE 4`, `inclusive BETWEEN`, `POSTED,REVERSED` vs Journal Draft-opt-in) + `decimal.js`.

- **Trial Balance** `/reports/trial-balance?company=<id>` — per-account Opening/Period/Ending, footer `Total Ending Debits = Total Ending Credits` + Balanced badge; fixture `120000` halves.
- **Income Statement** `/reports/income-statement?company=<id>` — INCOME credits-debits, EXPENSE debits-credits, Net `12000` (`20000-8000`).
- **Balance Sheet** `/reports/balance-sheet?company=<id>` — as-of `112000` assets = `L0+E100000+CE12000`.
- **General Journal** `/reports/general-journal?company=<id>` — chronological journal lines with Entry #, Date, Reference, Account, Debit/Credit, Status; Draft-opt-in via `?status`.
- **General Ledger** `/reports/general-ledger?company=<id>` — per-account Opening + running balance.

Every report has `FilterBar` (from/to `Asia/Manila` `en-PH` PHP, account multi), **PrintLayout** (`@media print` `[data-print-hide]`), and **Export** `GET /api/export/[report]?format=csv|xlsx&company=<id>` (`buildCsv/buildXlsx` via `exceljs`, `Content-Disposition`, `Asia/Manila`) + `e2e/reports.spec.ts`.

## What’s in Phase 5 — Companies + Imports

- **Companies** — `company` table `(id, organization_id FK, name 1–120, client_name, status ACTIVE|ARCHIVED, unique (organization_id,name))`, `?company=<uuid>` routing, Default `Example Client` per org (`00020` trigger), `Catering — JAC` etc.; `CompanyForm` create/update/archive (`23505` duplicate), `CompanySwitcher` preserves `?company=`; all owned tables `account`/`fiscal_period`/`journal_entry`/`import_batch`/`audit_event` carry `company_id` (FK, `00015` backfill, `00018 NOT NULL` + `Insert company_id?` patch for trigger compat, `00019/00020` default triggers). Fresh companies start 0 rows; inputs carry hidden `company_id`; RLS `company_select_member` + `*_select_company` via `exists (company join membership)`.
- **Imports** — `/imports?company=<id>` two tabs: **Chart of Accounts** (`CsvUpload` → `importAccountsCsv` via `parseTabular` `.csv/.xlsx/.xls`, header `Account Code, …`, rowErrors + `ErrorPanel` download) and **Journal Entries** (`JournalUpload` → `importJournalCsv` via `parseTabular`, Entry Group ≥2, balanced per Group, open period per Company, `DRAFT` + `import_batch JOURNAL_ENTRIES`); templates at `templates/chart-of-accounts.csv` + `templates/journal-entries.csv` (also `.xlsx` accepted). Dashboard now per-Company (5 totals period-scoped when OPEN period exists) + Activity at `/activity?company=<id>` (audit events).
- **Performance** — `src/server/auth.ts` `cache()` for `getOrganizationContext` (profile‖membership `Promise.all`) + `getActiveCompanies` dedupes layout+page; `next.config.ts` `optimizePackageImports` + `staleTimes`; `middleware.ts` `getSession` cookie-only; per-Company composite indexes `00021`; pagination `journal 50` + dashboard `200`; `loading.tsx` skeletons; build `27` routes.

## What’s in W1 — Client Companies Quick Wins

- **Editable company profile** at `/settings` — TIN, RDO, branch code, address, VAT classification (`VAT|NON_VAT|PERCENTAGE`), fiscal year start month, all validated via `organizationUpdateSchema`.
- **Cash account flag** — `account.is_cash` boolean + `cf_category` `OPERATING|INVESTING|FINANCING` editable in `AccountForm`; `is_cash` drives Dashboard **Cash balance** widget.
- **Entry types** — `STANDARD|OPENING|ADJUSTING` selector in `JournalForm` (REVERSAL system-only).
- **Batch posting** — **Post all drafts** on `/journal?company=` via `batchPostDrafts` RPC loop.
- **Dashboard enrichment** — Cash balance (Σ `is_cash` ending), Net income (period), Recently posted 5, Recent imports 3 + history link.
- **Import history** — `/imports/history?company=` paginated `import_batch` table.
- **Report drill-down + comparatives** — Trial Balance `code`/`ending` and Income Statement `amount` link to `/journal?company&account&from&to`; Income Statement prior-period column + variance.

## What’s in W2 — Period Lifecycle

- `00024` adds `reopened_at`, `reopened_by_id`, `reopened_reason` (5–500) to `fiscal_period`; **Reopen** dialog on `CLOSED` rows with required reason → `audit_event REOPEN`; `Reopened` amber badge on OPEN rows.
- **Month-end checklist** on `/settings/periods?company=` per OPEN period — Draft count (`0` pass) + Trial Balance `isBalanced` → card with **Pass/Fail** badges; **CloseConfirm** shows checklist and requires **Force close anyway** checkbox when failing, writes `audit_event CLOSE {draft_count, tb_balanced, forced}`.

## What’s in W3 — Cash Flow

- `00025` `cf_category` + `Workpaper` hygiene; `getCashFlow` indirect: `NI + Δoperating −Δinvesting +Δfinancing` vs `ΣΔ is_cash`, reconciled badge; page `/reports/cash-flow?company=` + export `cash-flow` CSV/XLSX, Reports submenu entry; fixture reconciles `102000 = 2000 + 100000`.

## What’s in W4 — Attachments

- Private `storage.buckets attachments` + `attachment` table + RLS + `storage.objects` policies; `uploadAttachment`/`deleteAttachment` actions; `AttachmentsCard` on `/journal/[id]` (POSTED & DRAFT); `doc=missing|with` filter on `/journal`.

## What’s in W5 — Reconciliation

- `00027` `reconciliation` + `reconciliation_item` + RLS; workspace `/reconciliation?company=` — create recon (account + range + statement balance), import statement `Date/Description/Amount` CSV/XLSX via `parseTabular`, match items ↔ posted lines (auto-match by amount ±0.01), header `Ledger − Statement = Difference`.

## What’s in W6 — Workpapers + Tax Center

- `00028` `workpaper_note(company,schedule,period_end)` + `filing_status`; **Workpapers** `/workpapers?company=&asOf=` 10 schedules by code-prefix + balances as-of + drill to GL + notes upsert; **Tax Center** `/tax-center?company=&year=` profile card, filing calendar generated by classification (VAT 2550M/2550Q, 1601C, 1701Q, Annual), `FilingStatusButton` toggle `FILED/NOT_STARTED`, tax-account `22*/23*` reconciliation, export `tax-workpaper` CSV.

## Accountant user guide

See `docs/user-guide.md` for the short orientation + 12-step testing script (create 5 entries, unbalanced attempt, duplicate, reverse, import, reports, export, Workbook compare) and feedback questions.

## Test account setup

1. Run migrations + seed as above.
2. Sign in at `/login` with `accountant@v0.local` / `demo-pass-123`. Already member of `V0 Accounting Demo`; first ACTIVE Company is `Example Client` with 6 accounts + 5 posted `JE-2026-0001..0005` (120000 fixture). Create additional Companies at `/companies` (e.g., `Catering — JAC`) — fresh companies start empty, import COA via `/imports?company=<newId>` or create accounts manually before first journal.
3. For a new org, `00020` auto-creates Default Company; `JE-YYYY-XXXX` continues per org.

## Known limitations

- Cross-company consolidated reports not yet present.
- Recurring journal templates not yet present (the one gap from the 10-feature list).
- Workpapers schedules are code-prefix heuristics — adjust codes or add accounts to match (no admin config UI yet).
- Filing calendar uses simplified BIR rules (VAT 2550M/Q, 1601C, 1701Q, Annual) — verify due dates before filing; proof-of-filing attachment link planned but not yet wired to FilingStatus rows.
- Reconciliation auto-match is amount-based ±0.01 — manual review still recommended; **Complete** gating is manual.
- `supabase db reset` only for local stack; hosted schema ships via migrations (now `00001..00028`, build `27` routes).
