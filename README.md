# ERP V0 — Accounting Prototype

Desktop-first accounting prototype: per-Project journal entries, posting, reversal, and five per-Project financial reports that must match an existing Excel workbook. **Stack** Next.js 16 (App Router, TypeScript strict) + Supabase (Postgres, Auth, RLS) + TanStack Table + decimal.js. Spec: `docs/superpowers/specs/2026-08-19-erp-v0-design.md`; Projects extension: `docs/superpowers/specs/2026-08-27-projects-design.md`.

## Prerequisites

- Node.js >= 20 (tested 24.19.0) + npm
- A hosted Supabase project (Seoul `tdmcnbnyusxdegzopxhd` for staging) or local CLI
- Git

## Local setup

```bash
npm install
cp .env.example .env        # then fill in your hosted project's URL and keys
```

Get the values from your Supabase project dashboard (Settings → API) or via the CLI:

```bash
npx supabase login
npx supabase projects api-keys --project-ref <project-ref>
```

Apply the schema migrations to your hosted project:

```bash
npx supabase link --project-ref <project-ref>
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
npx supabase db push                    # apply pending migrations to the linked project
npx supabase gen types typescript --linked > src/types/database.ts  # regenerate types (then patch Insert project_id? -> string for trigger compat if needed)
cmd /c "npx.cmd supabase gen types typescript --linked > src/types/database.ts"
```

`supabase db reset` is only for the local stack; on hosted, schema changes ship as new migrations (`supabase/migrations/00001..00021`).

## Tests

```bash
npm test                               # unit + integration (RLS needs .env.test, skipIf without keys)
npm run test:e2e                       # Playwright (needs production build + dev server: npm run build first, then npx playwright test --workers=1)
npm run typecheck && npm run lint && npm run build  # full verification before push (PM gate)
```

Hosted DB is used for integration: `tests/integration/reports/*` assert `120000` Trial halves, `12000` Income net, `112000` Balance assets; `tests/integration/projects.test.ts` per-Project code/period isolation; `tests/integration/journal-draft.test.ts` post/reverse + `audit_event` line_count.

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

For managed hosting (Vercel/Render/Fly), connect the repo and set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server-only), `NEXT_PUBLIC_SITE_URL` from your hosted Supabase project. Middleware (`src/proxy.ts`) refreshes sessions; `output: 'standalone'` is set in `next.config.ts`.

## Security notes

- The service-role key (`SUPABASE_SERVICE_ROLE_KEY`) is server-only. Never prefix with `NEXT_PUBLIC_`.
- All organization- and project-owned tables are protected by PostgreSQL Row-Level Security plus server-side `requireOrganization()` / `requireProject()` checks on every query/mutation/RPC.
- Secrets are never committed. Only `.env.example` and `.env.test.example` are tracked.

## What’s in Phase 2

- **Organization profile** at `/settings` — edit `name` + `legal_name`, other fields read-only.
- **Fiscal periods** at `/settings/periods?project=<id>` — per-Project list, create OPEN period, close with confirmation; overlap blocked by per-Project `exclude gist (project_id, daterange)` (`00015` + `00017`).
- **Chart of Accounts** at `/accounts?project=<id>` — per-Project TanStack table (Code · Name · Type · Normal Balance · Active), validated create/edit, deactivation with “N journal lines use this” warning, and atomic **CSV/XLSX** import (`templates/chart-of-accounts.csv` template, `parseTabular` via papaparse/exceljs). Code unique per Project `(project_id,code)` (`00015`). Fresh projects start 0 rows; Example Client seeded 6 canonical accounts via `00013` backfilled to Example Client.

## What’s in Phase 3

- **Journal** — `/journal?project=<id>` filterable by date/status/account/free text; `/journal/new?project=<id>` and `/journal/[id]?project=<id>`: header (`entry_date` in OPEN period, `reference` 1–60, `description` 1–200) + line grid (Account picker active per Project, Description, Debit xor Credit, Tax code; **Enter** advances cell→next row (auto-append), **Shift+Enter** back, **ArrowUp/Down** same column; sticky footer **Total Debit / Total Credit / Difference** via `sumLineAmounts` + `decimal.js`, Post disabled until balanced + ≥2 lines; `isBalanced` via `decimal.js`).
- **Draft lifecycle** — Save Draft (validated Server Action, resolves `fiscal_period_id` via `BETWEEN` on OPEN period per Project, computes totals with `toDbString`) + Duplicate (`-copy`) and Delete (DRAFT-only).
- **Posting** — `post_journal_entry` RPC (`SECURITY DEFINER`, `FOR UPDATE` on `journal_entry_sequence` per-org) assigns `JE-YYYY-XXXX` (`YYYY` from `entry_date`, `XXXX` zero-padded `last_number+1`), sets `POSTED`/`posted_at`, writes `audit_event`; read-only view shows `JE-YYYY-XXXX`, Posted badge, no edit inputs.
- **Reversal** — on POSTED: **Reverse** dialog with date picker (must be in OPEN period) and swapped-lines preview (`debit↔credit`); `reverse_journal_entry` RPC creates `REVERSAL` entry (`Reversal of …`) and marks original `REVERSED`.
- **Numbering** — `JE-YYYY-XXXX` per `organization_id` via trigger `00019/00020` default `project_id` fallback; journal import groups validated via `journal-import.ts` (Entry Group ≥2, `YYYY-MM-DD` in OPEN per Project, active account, balanced).

## What’s in Phase 4 — Reports (per-Project)

All five reports are **per-Project** (`?project=<uuid>` flat, `ProjectSwitcher` shows `name — client_name`, canonical `307` redirect, `withProject` preserves `?project=`). Shared engine `src/server/reports/balances.ts` (`computeBalance` half-up `MONEY_SCALE 4`, `inclusive BETWEEN`, `POSTED,REVERSED` vs Journal Draft-opt-in) + `decimal.js`.

- **Trial Balance** `/reports/trial-balance?project=<id>` — per-account Opening/Period/Ending, footer `Total Ending Debits = Total Ending Credits` + Balanced badge; fixture `120000` halves.
- **Income Statement** `/reports/income-statement?project=<id>` — INCOME credits-debits, EXPENSE debits-credits, Net `12000` (`20000-8000`).
- **Balance Sheet** `/reports/balance-sheet?project=<id>` — as-of `112000` assets = `L0+E100000+CE12000`.
- **General Journal** `/reports/general-journal?project=<id>` — chronological journal lines with Entry #, Date, Reference, Account, Debit/Credit, Status; Draft-opt-in via `?status`.
- **General Ledger** `/reports/general-ledger?project=<id>` — per-account Opening + running balance.

Every report has `FilterBar` (from/to `Asia/Manila` `en-PH` PHP, account multi), **PrintLayout** (`@media print` `[data-print-hide]`), and **Export** `GET /api/export/[report]?format=csv|xlsx&project=<id>` (`buildCsv/buildXlsx` via `exceljs`, `Content-Disposition`, `Asia/Manila`) + `e2e/reports.spec.ts`.

## What’s in Phase 5 — Projects + Imports

- **Projects** — `project` table `(id, organization_id FK, name 1–120, client_name, status ACTIVE|ARCHIVED, unique (organization_id,name))`, `?project=<uuid>` routing, Default `Example Client` per org (`00020` trigger), `Catering — JAC` etc.; `ProjectForm` create/update/archive (`23505` duplicate), `ProjectSwitcher` preserves `?project=`; all owned tables `account`/`fiscal_period`/`journal_entry`/`import_batch`/`audit_event` carry `project_id` (FK, `00015` backfill, `00018 NOT NULL` + `Insert project_id?` patch for trigger compat, `00019/00020` default triggers). Fresh projects start 0 rows; inputs carry hidden `project_id`; RLS `project_select_member` + `*_select_project` via `exists (project join membership)`.
- **Imports** — `/imports?project=<id>` two tabs: **Chart of Accounts** (`CsvUpload` → `importAccountsCsv` via `parseTabular` `.csv/.xlsx/.xls`, header `Account Code, …`, rowErrors + `ErrorPanel` download) and **Journal Entries** (`JournalUpload` → `importJournalCsv` via `parseTabular`, Entry Group ≥2, balanced per Group, open period per Project, `DRAFT` + `import_batch JOURNAL_ENTRIES`); templates at `templates/chart-of-accounts.csv` + `templates/journal-entries.csv` (also `.xlsx` accepted). Dashboard now per-Project (5 totals period-scoped when OPEN period exists) + Activity at `/activity?project=<id>` (audit events).
- **Performance** — `src/server/auth.ts` `cache()` for `getOrganizationContext` (profile‖membership `Promise.all`) + `getActiveProjects` dedupes layout+page; `next.config.ts` `optimizePackageImports` + `staleTimes`; `middleware.ts` `getSession` cookie-only; per-Project composite indexes `00021`; pagination `journal 50` + dashboard `200`; `loading.tsx` skeletons; build still `18` routes.

## Accountant user guide

See `docs/user-guide.md` for the short orientation + 12-step testing script (create 5 entries, unbalanced attempt, duplicate, reverse, import, reports, export, Workbook compare) and feedback questions.

## Test account setup

1. Run migrations + seed as above.
2. Sign in at `/login` with `accountant@v0.local` / `demo-pass-123`. Already member of `V0 Accounting Demo`; first ACTIVE Project is `Example Client` with 6 accounts + 5 posted `JE-2026-0001..0005` (120000 fixture). Create additional Projects at `/projects` (e.g., `Catering — JAC`) — fresh projects start empty, import COA via `/imports?project=<newId>` or create accounts manually before first journal.
3. For a new org, `00020` auto-creates Default Project; `JE-YYYY-XXXX` continues per org.

## Known limitations

- Financial reports are post-only; Dashboard totals are for the selected OPEN period (falls back to all-time when no OPEN period).
- Single project visible at a time via `?project=`; no cross-project consolidated reports.
- Opening-balance import is via a balanced `OPENING` journal entry (no direct balance field).
- No recurring templates, attachments, report drill-down, BIR filing, AP/AR, bank rec, inventory, payroll, or fixed-asset modules (optional scope deferred).
- No multi-company switching in UI (schema ready via `organization_id`).
- Import preview is server-validated rowErrors panel (no client-side spreadsheet map wizard).
- Activity history is read-only audit log at `/activity?project=<id>` (no org-wide view, no user filter beyond page).
