# Projects (Clients) — Design Specification

Date: 2026-08-27
Status: Ready for review
Phase: 5 of 6 (Phase 4 reports shipped 2026-08-27)
Spec: Extends `docs/superpowers/specs/2026-08-19-erp-v0-design.md` §5 and `2026-08-26-phase4-reports-design.md`
Plan: `docs/superpowers/plans/2026-08-27-projects.md`

## 1. Objective

Give one `ACCOUNTANT` inside one `Organization` (pilot `V0 Accounting Demo 22222222-...`) multiple fully self-dependent ledgers — called **Projects** (client engagements) — so the accountant can keep the example client and her own project side-by-side without data leakage. Every accounting concept that was per-Organization becomes per-Project, while `JE-YYYY-XXXX` numbering intentionally stays per Organization.

## 2. Scope

### Must include (this phase)

- **Project entity** `public.project` (`id uuid PK`, `organization_id FK cascade`, `name text 1–120`, `client_name text 0–120 nullable`, `status ACTIVE|ARCHIVED`, `created_at`). `unique (organization_id, name)` — display name unique per org; code-level uniqueness moves to per-Project (see below).
- **Project-scoped isolation** — add `project_id uuid FK → project(id) cascade` to:
  - `account` — new `unique (project_id, code)` replaces `unique (organization_id, code)`; `code`  numeric, `name/type/normal_balance` unchanged.
  - `fiscal_period` — `exclude using gist (project_id with =, daterange(start_date,end_date,'[]') with &&)` replaces `(organization_id, ...)`; `unique (project_id, name)`.
  - `journal_entry` — carries `project_id`; `project_id` + `organization_id` both stored (redundant for RLS join, audited).
  - `import_batch` — `project_id` for traceability.
  - `audit_event` — `project_id` nullable on backfill then `not null` for new rows.
  - All new `project_id` columns `not null` after backfill. Existing rows (Phase 2 seed 6 demo accounts, Phase 4 5 `JE-2026-*` `120000` halves, `July 2026 Test Period`) backfill to a **Default Project** `Example Client` auto-inserted per organization on migration. New orgs get one `Default Project` on creation if none.

- **Entry numbering stays per Organization** — `journal_entry_sequence` (`organization_id PK, last_number`) unchanged; `post_journal_entry`/`reverse_journal_entry` keep `FOR UPDATE` on `organization_id`. `entry_number` uniqueness stays `unique (organization_id, entry_number)`. `reference` `JE-YYYY-XXXX` is therefore organization-wide, not per-Project (simpler for example client + your project; avoids per-project counter drift).

- **RLS + server guard** — extend `supabase/migrations/00009_rls_policies.sql` addendum: every project-owned table policy adds `exists (select 1 from public.project p where p.id = row.project_id and p.organization_id in (select organization_id from organization_membership where user_id=auth.uid()))`. `project` table itself: `select` where `organization_id` in membership, `insert/update` where same. `src/server/auth.ts:60` `requireOrganization()` still org gate; add `requireProject(organizationId, projectId)` helper that `select ... where id=projectId and organization_id=ctx.organization.id and status='ACTIVE'` or throws `UnauthorizedError` / returns 404. Missing `?project=` defaults to first `ACTIVE` project ordered by `created_at`.

- **Flat `?project=` routing** — no new route folder; keep `src/app/(app)/accounts/page.tsx`, `journal/*`, `reports/*`, `imports/*`, `settings/periods/*` at same paths. Every Server Component reads `searchParams: Promise<Record<string,string|undefined>>` already; now also `const projectId = params.project ?? (await searchParams).project ?? defaultProject.id`. Pass `projectId` to every `src/server/reports/*.ts` (`getBalances({projectId})`, etc.) and to every `src/server/actions/*` (`upsertAccount`, `upsertJournalEntry`, `createFiscalPeriod`, `import*`). Client `src/components/reports/FilterBar.tsx` keeps `?account=&q=&status=` but `ProjectSwitcher.tsx` controls `?project=` (Select, debounced `router.push`, cookie `active_project` for default).

- **Reports + import + export per Project** — `src/server/reports/balances.ts:26` adds `.eq('account.project_id', projectId)` on `account` and `.eq('journal_entry.project_id', projectId)` on joined lines; all 5 report pages include `ProjectSwitcher` above `FilterBar` and `ReportHeader` filter chip `project=Example Client`. `src/app/api/export/[report]/route.ts:14` adds `?project=` to same predicate. `POSTED/REVERSED` inclusive `BETWEEN`, Draft opt-in on Journal only, per-Project as before.

- **UI shell** — `src/components/layout/ProjectSwitcher.tsx` (`'use client'` `Select` of ACTIVE projects, `status ARCHIVED` hidden but still queryable via direct `?project=` for historical reports), `src/app/(app)/projects/page.tsx` list/create (`name`, `client_name`, Archive button `status=ARCHIVED` with warning like `DeactivateConfirm.tsx` when project has `journal_line` count >0 but history retained). Sidebar adds `Projects` link.

### Explicitly out of scope (deferred)

- Per-Project `JE-YYYY-XXXX` sequence (stays org, can migrate later with `00016` if needed).
- Per-Project membership / role (single `ACCOUNTANT` sees all projects in org).
- Consolidated org-wide reports across projects.
- Project-scoped `tin/rdo` cloning beyond `client_name`.
- Multi-org switching in UI (Phase 1 out-of-scope stays).

### Source of truth

`CONTEXT.md` `Project` term is authoritative; `2026-08-19-erp-v0-design.md` §5 plus Phase 4 engine remain source for accounting math; `?project=` flat keeps JE per org per user request.

## 3. Technology stack

Same as Phases 2–4: Next.js 16.3.1 App Router TS strict + Tailwind + shadcn/ui `Select`/`Dialog`/`Badge` + TanStack Table + `@supabase/ssr` hosted `tdmcnbnyusxdegzopxhd` (`src/proxy.ts` `proxy`) + `server-only` + `decimal.js` + `Intl en-PH` + Zod + `papaparse` + `exceljs` (already installed Phase 4). No new framework.

## 4. Required pages and routes

No path changes — existing routes gain `?project=` param:

- `/projects` — list ACTIVE projects + New Project dialog + Archive confirm. Empty state "Create your first Project (e.g., Example Client)".
- `/accounts`, `/journal`, `/journal/new`, `/journal/[id]`, `/reports/*`, `/imports`, `/settings/periods` — all now require `?project=`; missing → default first ACTIVE project. Each fetch adds `.eq('project_id', projectId)` alongside `organization_id`.
- Sidebar: `Projects` nav item + `ProjectSwitcher` (sticky, `data-project-switcher`, hidden on `@media print` like `data-filter-bar`).

## 5. Data model

```
project { id uuid PK, organization_id uuid FK → organization(id) cascade, name text 1–120, client_name text 0–120 nullable, status ACTIVE|ARCHIVED, created_at timestamptz, unique (organization_id, name), index (organization_id) }
account { ..., project_id uuid FK → project(id) cascade not null after backfill, unique (project_id, code) replaces (organization_id, code), index (project_id, code) }
fiscal_period { ..., project_id uuid FK → project(id) cascade not null, unique (project_id, name), exclude gist (project_id, daterange) }
journal_entry { ..., project_id uuid FK → project(id) cascade not null, index (project_id, entry_date), index (project_id, status) }
import_batch { ..., project_id uuid FK → project(id) cascade not null }
audit_event { ..., project_id uuid FK → project(id) cascade not null for new rows }
journal_entry_sequence { organization_id PK, last_number bigint } — unchanged (per-org JE)
```

Backfill in migration `00015_projects.sql` (idempotent `on conflict` + `where project_id is null` updates) inserts one `Example Client` per `organization` if none.

## 6. Business rules

- `code` numeric unique **per Project**, not org — `A` in Project One can repeat in Project Two.
- Period `name` + overlap `exclude` per Project — `July 2026 Test Period` can exist in both Projects independently.
- Reports `getBalances({projectId})`: opening `< from` + period `BETWEEN from AND to` already, now also `project_id`; no cross-project sum.
- Import `importAccountsCsv`/`importJournal` validates `code` against Project's accounts only, writes `import_batch.project_id`.
- Archive checks `journal_line` count via `project_id` join like `DeactivateConfirm.tsx` — warns but still hides from creation forms, history/report retained.
- `JE-YYYY-XXXX` stays org sequence; two Projects posting concurrently still `FOR UPDATE` on same `organization_id` row (no duplicate per org).

## 7. Seed data

Phase 4 seed (6 demo accounts `1000/1100/3000/4000/5000/5100` + 5 `JE-2026-0001..0005` `120000` halves) now per-Project: backfill assigns them to `Example Client` project; new Project `Your Project` starts empty (seed backfill `seedDemoAccountsIfEmpty(projectId)` on first visit inserts same 6 accounts if count 0 for that project, idempotent per `(project_id, code)`).

## 8. UX requirements

- Desktop-first, `ProjectSwitcher` visible above `FilterBar` on every accounting page, URL shareable (`?project=`), filter chips include `project=Name`.
- `Projects` page empty → CTA "New Project". List shows `name — client_name`, `status`, `created_at` (`formatBusinessDate`), Archive `AlertDialog`.
- Switching Projects does not lose `?from=&to=&account=` filters (merged `URLSearchParams` like `FilterBar.tsx:29`).

## 9. Automated tests

- **Integration** (isolated org+project+user per `tests/integration/journal-draft.test.ts` pattern, `afterAll` delete in reverse FK order):
  - `projects.test.ts` — create project ok, duplicate name per org → `23505`, create same name in different org ok, archive `ACTIVE→ARCHIVED` hides from switcher but `?project=archivedId` still loads history.
  - Extend `reports/*` suites to create **2 projects** under one org, each with its own fixture, assert `Project A 120000` halves vs `Project B 0`, CSV import to A not in B, ledger opening not leaked.
- **E2E** `e2e/projects.spec.ts` `serial 60_000` — `signIn` → `/projects` → create `My Project` → switch to it → `/accounts` shows empty→seeded 6 → `/reports/trial-balance?project=exampleId` shows `120000` vs `?project=myId` shows empty/0, cross-check export `?project=` per-project `Content-Disposition`.

## 10. Locked decisions

1. **Flat `?project=`** (Option A) — no new `[projectId]` route folder; minimal churn, JE per org preserved.
2. **Full isolation per Project** except JE sequence (per org).
3. **Default Project** `Example Client` per org auto-inserted on migration, takes existing rows.
