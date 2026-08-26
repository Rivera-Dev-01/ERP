# W1 — Client Companies Quick Wins — Plan

Date: 2026-08-26
Source spec: `docs/superpowers/specs/2026-08-26-w1-client-companies-design.md`
Mode: PM-Orchestrated Multi-Agent (same as Gap A-B-C), staged merges.

## Slice graph
S1 (migration rename) → S2 (code sweep) → [S3,S4,S5,S6,S7,S8,S9 parallel after rename lands]

## S1 — Migration 00022 rename project→company
- **Files:** `supabase/migrations/00022_rename_project_to_company.sql`, `supabase/migrations/00023_account_is_cash.sql` (is_cash split if preferred)
- **SQL:** `alter table project rename to company; alter table account rename column project_id to company_id;` ×5 child tables; recreate RLS policies (grep `project` in 00015 + 00009), constraints (`project_id` uniques, gist), triggers 00019/00020 bodies, indexes 00021; add `branch_code,address` cols on organization inside same migration or 00024.
- **Types:** `npx supabase gen types`
- **Verify:** `npx supabase db push` (hosted), `psql \d company` shows renamed.

## S2 — Code sweep project→company
- **Search list (must grep all):** `project`, `Project`, `PROJECT`, `project_id`, `ProjectId`, `PROJECT_ID`, `?project=`, `/projects`, `ProjectSwitcher`, `ProjectForm`, `projects.test.ts`, `offers project` etc. Include supabase string literals `.eq('project_id'` → `.eq('company_id'`).
- **Files:** `src/server/auth.ts`, `src/server/reports/balances.ts` + 5 helpers, `src/server/actions/*` (company-actions rename), `src/lib/validation/*`, all `src/app/(app)/*` pages (reports×5, journal×3, accounts, imports, activity, dashboard, settings/periods, layout, companies), `src/components/**` (switcher/form/table), `tests/**`, `e2e/**`, `CONTEXT.md`, `README.md`, `docs/user-guide.md`.
- **Routes:** move `src/app/(app)/projects` → `src/app/(app)/companies`; old `?project=` 301: in each page, if `params.project` present redirect to `?company=` value; keep canonical check for `params.company`.
- **Commit:** `chore(rename): project→company DB+code+routes`

## S3 — Editable org profile
- **Files:** `src/lib/validation/organization.ts`, `src/server/actions/organization-actions.ts` (updateOrganization), `src/components/settings/OrgProfileForm.tsx`, `src/app/(app)/settings/page.tsx`, migration for `branch_code/address` if not in S1.
- **Tests:** unit zodiac for new fields.

## S4 — is_cash
- **Files:** `supabase/migrations/*`, `src/components/accounts/AccountForm.tsx`, `src/components/accounts/AccountsTable.tsx`, `src/lib/validation/account.ts`.
- **Tests:** unit + integration seed.

## S5 — entry_type
- **Files:** `src/lib/validation/journal.ts` (+ sumLineAmounts keep), `src/components/journal/JournalForm.tsx`, `src/app/(app)/journal/page.tsx` badge, `tests/unit/domain/journals.test.ts`.

## S6 — Batch posting
- **Files:** `src/server/actions/journal-actions.ts` (batchPostDrafts), `src/app/(app)/journal/page.tsx` toolbar + dialog, `src/components/journal/BatchPostDialog.tsx` (new).

## S7 — Dashboard widgets
- **Files:** `src/app/(app)/dashboard/page.tsx`, maybe `src/server/reports/balances.ts` reuse.

## S8 — Import history
- **Files:** new `src/app/(app)/imports/history/page.tsx` + `loading.tsx`, `src/components/imports/HistoryTable.tsx`.

## S9 — Drill-down + comparatives
- **Files:** `src/app/(app)/reports/*` (5), `src/components/reports/ReportTable.tsx` link handling, `src/server/reports/income-statement.ts` prior period logic.

## Verification (PM gate)
Per slice: `git diff --stat` vs matrix, `npm run typecheck` + slice `vitest`, `npm run build` after S2. Final: full `typecheck && lint && vitest 88+ && build` + manual `?company=` smoke (fresh 0 vs 138000, activity per company, cash widget).

## Commit plan
- S1: `chore(db): 00022 rename project→company`
- S2: `chore(rename): project→company code+routes+docs`
- S3–S9: one commit each `feat(...)` per slice above.
