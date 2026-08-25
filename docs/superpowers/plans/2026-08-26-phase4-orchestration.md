# Phase 4 — PM-Orchestrated Execution Map

Spec: `docs/superpowers/specs/2026-08-26-phase4-reports-design.md`
Plan: `docs/superpowers/plans/2026-08-26-phase4-reports.md`
Workflow: `~/.agents/skills/workflow/SKILL.md` — Execution Modes → PM-Orchestrated

## Roles

- **PM (persistent):** owns contract + blackboard (`docs/superpowers/plans/.phase4-blackboard.md`), the plan's `Files:` matrix, and every gate. Check-and-gate with fix via Reconciliation lane.
- **Workers (ephemeral, parallel within a slice):** touch only their slice's files; MUST import the contract; report Touched/Evidence/Open.
- **Reconciler (on-demand):** normalizes shared predicate when a query lives in two places (page + export route).

## Contract (Slice 09 pre-flight — PM, sequential, ~5 min)

Frozen before any slice worker starts:
- `src/server/reports/balances.ts` — `getBalances({organizationId,from,to,accountIds})`, `computeBalance(type,normal_balance,debit,credit)` via `decimal.js` half-up
- Demo seed: `JE-2026-0001..0005` for org `22222222-2222-2222-2222-222222222222` + `journal_entry_sequence.last_number=5`

## Lane Map (parallel within slice, staged merges in dependency order)

### Slice 09 — Shared engine + demo seed
- 09A-engine: `balances.ts` + `tests/unit/reports/balances.test.ts` (normal_balance, opening/period, rounding)
- 09B-seed: `supabase/migrations/00013_demo_entries.sql` (idempotent 5 POSTED entries)
- PM merge 09 → `typecheck` → `vitest run tests/unit/reports/balances.test.ts` → `db push` → `gen types` → commit

### Slice 10 — General Journal + General Ledger
- 10A-journal: `general-journal.ts` + `general-journal/page.tsx` (chronological, status toggle)
- 10B-ledger: `general-ledger.ts` + `general-ledger/page.tsx` (opening + running)
- 10C-UI: `ReportHeader`, `FilterBar`, `ReportTable`, `PrintLayout` shells
- PM merge 10 → typecheck → `tests/integration/reports/general-ledger.test.ts` → commit

### Slice 11 — Trial / Income / Balance
- 11A-trial: `trial-balance.ts` + `trial-balance/page.tsx` (total debits=credits)
- 11B-income: `income-statement.ts` + `income-statement/page.tsx` (net 12000)
- 11C-balance: `balance-sheet.ts` + `balance-sheet/page.tsx` (as-of, 112000)
- PM merge 11 → typecheck → `tests/integration/reports/*` (trial/income/balance + draft/reversed/boundary) → commit

### Slice 12 — Export + Print + E2E
- 12A-export: `exceljs` install + `server/imports/export.ts` + `app/api/export/[report]/route.ts` (csv/xlsx, same predicate)
- 12B-e2e: `e2e/reports.spec.ts` (download CSV+XLSX + print + post delta)
- PM final sweep: `typecheck && lint && vitest run && build && playwright --workers=1` → commit polish

## Gates

- Per-worker: `npx vitest run <lane tests>` + `tsc --noEmit` on lane subset.
- Per-merge: `npm run typecheck && npm run lint` (PM checks `git diff --stat` vs matrix; `git add <slice files>` only).
- Final: full sweep after last merge.

## Blackboard

Append-only `docs/superpowers/plans/.phase4-blackboard.md`:
- PM posts "Contract frozen" / "Slice N merged green"
- Workers post "Touched: <paths> | Evidence: <typecheck/vitest> | Open: <cross-slice needs>"
