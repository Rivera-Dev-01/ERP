# W1 — Client Companies Quick Wins — Design Spec

Date: 2026-08-26
Status: Approved for build (user: "Full rename incl. DB" + Full URL rename + is_cash flag)
Source: User list "Best accountant-only features" §1-4,6,10 gaps identified in audit 2026-08-26

## 1. Goal
Close the highest value-per-effort gaps on top of the shipped V0+Projects+Perf+Gap-A/B/C. Make the accountant's daily flow feel like "companies" not "projects", keep the single-accountant V0 scope, and keep the Reports engine as truth.

## 2. Non-Goals (deferred to W2-W6)
Reopen-with-reason, month-end checklist, Cash Flow, Attachments (Storage), full Reconciliation workspace, Workpapers/Tax Center, saved column mappings, cross-batch duplicate-reference detection (beyond DB unique per company+entry_number), Adjusted TB as separate report.

## 3. Decisions locked with user
- Rename Project → Company everywhere: DB table `project`→`company`, columns `project_id`→`company_id` on 5 child tables, RLS policies, constraints/indexes, triggers, types, code, routes `/projects`→`/companies`, query `?project=`→`?company=` with 301 from old. (Full, not UI-only)
- Dashboard cash balance identified by new `account.is_cash boolean default false` (explicit, accountant-controlled) — not code-prefix or name-match.
- VAT classification becomes a strict select VAT | NON_VAT | PERCENTAGE (kept as text + Zod enum).
- Sidebar final shape: Dashboard · Companies · Fiscal Periods (promoted out) · Chart of Accounts · Journal Entries · Imports (+History) · Reports submenu · Activity · Settings.

## 4. Slices (S1-S9)

### S1 Migration 00022 — Rename project→company (atomic, do first)
Postgres `ALTER TABLE ... RENAME` is metadata-only (instant). Single migration:
- `alter table project rename to company;`
- `alter table account rename column project_id to company_id;` (same for fiscal_period, journal_entry, import_batch, audit_event)
- Drop + recreate under new names: all `*_select_project` RLS (now `*_select_company` + `company_select_member`), `(company_id,code)` uniques, `fiscal_period_company_id_daterange_excl` gist, `audit_event_company_idx`, 00021 indexes (`idx_journal_entry_org_company_status_date` etc.), triggers `set_default_company_id` / `create_default_company_for_org` (recreate from 00019/00020 with new column names).
- Regen `src/types/database.ts`.

### S2 Code sweep — project→company
Search: `project`/`Project`/`PROJECT`/`project_id`/`ProjectId`/`PROJECT_ID`/`?project=`/`projects`/`ProjectSwitcher`. Rename:
- `auth.ts`: `getActiveProjects`→`getActiveCompanies`, `requireProject`→`requireCompany`, `getDefaultProjectId`→`getDefaultCompanyId`
- `balances.ts` + 5 report helpers: param `projectId`→`companyId`, `eq('company_id', ...)`
- Pages: all `?project=` handling → `?company=` with 301 fallback from old, move `src/app/(app)/projects`→`src/app/(app)/companies`, `src/app/(app)/reports/*`, `src/app/(app)/journal`, `accounts`, `imports`, `activity`, `settings/periods`, `dashboard` (already period-scoped) — all read `params.company` + canonical redirect.
- Components: `ProjectSwitcher`→`CompanySwitcher`, `ProjectForm`→`CompanyForm`, hidden inputs `company_id`, `CsvUpload`/`JournalUpload` props, `ReportTable` links, `withCompany` helper in sidebar.
- Actions: `project-actions.ts`→`company-actions.ts` + `account-actions.ts`/`period-actions.ts`/`journal-actions.ts`/`import-actions.ts` (`company_id`).
- Tests: `projects.test.ts`→`companies.test.ts`, `account.test.ts` (`seedCompanyId`), E2E `projects.spec.ts`→`companies.spec.ts` paths/asserts, `journal.spec` `?company=`.
- Docs: `CONTEXT.md` term rewrite, `README.md`, `docs/user-guide.md`, plan/spec docs.

Regression net: existing integration report tests (Trial 120000, Income 12000, Balance 112000) stay green per-company; `companies.test.ts` `code unique per company` + `period overlap per company`.

### S3 Editable company profile
New columns on `organization`: `branch_code text`, `address text` (both nullable, max 120/200). Already have `tin`, `rdo`, `tax_classification`, `fiscal_year_start_month` read-only — make them editable via `updateOrganization`:
- Zod `organizationUpdateSchema` adds `tin` (9-12 digits), `rdo` (3 digits), `branch_code` (5 chars or 00000), `address`, `tax_classification` enum VAT|NON_VAT|PERCENTAGE, `fiscal_year_start_month` 1-12, `timezone` keep Asia/Manila default.
- UI: `/settings` `OrgProfileForm` extends fields, shows current `currency_code` read-only.

### S4 Account is_cash
Migration `00023`: `alter table account add column is_cash boolean not null default false; create index idx_account_company_is_cash`.
- `AccountForm` checkbox "Cash account" (only for `type ASSET`? but allow any, server validates `is_cash => type ASSET` warning).
- `AccountsTable` column "Cash" ✓/—.
- Validation `accountSchema` adds `is_cash?: boolean`.

### S5 Entry-type selector
`JournalForm` header select `entry_type` default `STANDARD` options STANDARD|OPENING|ADJUSTING (REVERSAL is system-only). `journalSchema` adds `entry_type` optional enum. Save passes through to `journal_entry.entry_type`; read-only view badge shows type.

### S6 Batch posting
Journal toolbar button "Post all balanced drafts" (visible when ≥1 DRAFT). Click → confirm dialog listing N drafts + total `₱` sum → server action `batchPostDrafts(companyId)` loops `post_journal_entry` RPC per id, collects successes/failures, returns counts; toast `Posted X/Y`.

### S7 Dashboard enrichment
Widgets in `dashboard/page.tsx` after period-scoped totals:
- **Cash balance**: Σ `ending` of `is_cash=true` ASSET accounts as-of `period.end_date` (reuse `getBalances` or direct sum).
- **Net income**: period net from balances (reuse).
- **Recently posted**: last 5 `POSTED` by `posted_at desc` per company.
- **Import status**: latest 3 `import_batch` per company with `FAILED`/rowErrors link to history.
All per-company, all `Promise.all` parallel.

### S8 Import history page
New `src/app/(app)/imports/history/page.tsx` per-company `?company=` (canonical), paginated 50, table file_name/type/status/row counts/date + error download link. Limitation noted: original file bytes not stored.

### S9 Drill-down + comparatives
- Drill-down: `TrialBalance` ending, `IncomeStatement` amount, `GeneralLedger` movements become `<Link>` to `/journal?company=…&account=…&from&to` (POSTED).
- Comparative: Income Statement gains **Prior Period** column (same-length window shifted back), `Variance` diff.
- Adjusted TB deferred (all POSTED already include ADJUSTING).

## 5. Data-flow & error handling
All mutations via Server Actions + `requireOrganization()`/`requireCompany()` double-gate + RLS. Migration renames are transactional; old `?project=` routes 301 to `?company=` for one release. Trigger recreates keep `JE-YYYY-XXXX` per organization. Errors: Zod fieldErrors + formError toast, never leak DB.

## 6. Testing
- S1/S2: no new unit; regression = 88 existing tests + 5 report fixtures per-company must pass.
- S3/S4/S5: zod unit for new enums/fields; integration: update org succeeds, is_cash persists + dashboard cash widget reflects, entry_type persists.
- S6: unit for batchPost helper, integration: batch posts 2 drafts → 2 POSTED + audit rows.
- S7: dashboard unit not practical — e2e smoke: `?company=` shows cash/NI widgets.
- S8: import_batch insert + history page shows row.
- S9: IS comparative column shows prior net, links have correct href.

## 7. Risks
Rename misses a string `project_id` (supabase `.eq('project_id')`) → runtime fail not typecheck. Mitigate: exhaustive grep list (supabase strings, RLS policy text, trigger bodies, templates, e2e) + typecheck + full vitest + build + manual smoke per-company isolation still 0 vs 138000.

## 8. Out of scope
W2 period reopen reason, W3 Cash Flow, W4 Storage, W5 recon, W6 workpapers/tax — separate specs.
