# W2 — Period Lifecycle — Plan

Date: 2026-08-26
Spec: `docs/superpowers/specs/2026-08-26-w2-period-lifecycle-design.md`

## S1 — Reopen
- Files: `supabase/migrations/00024_period_lifecycle.sql`, `src/types/database.ts` (regen), `src/lib/validation/fiscal-period.ts` (+reopenReasonSchema), `src/server/actions/period-actions.ts` (+reopenFiscalPeriod), `src/components/periods/ReopenDialog.tsx` (new), `src/components/periods/PeriodTable.tsx`, `tests/unit/domain/fiscal-periods.test.ts`
- Steps: migration three cols → types → validation → action dual-arity + audit REOPEN → dialog + table badge → unit test → typecheck.

## S2 — Checklist + gated close
- Files: `src/app/(app)/settings/periods/page.tsx`, `src/components/periods/CloseConfirm.tsx`, `src/server/actions/period-actions.ts` (close force + audit CLOSE), `tests/integration/period-close.test.ts` (new)
- Steps: page checklist queries (draft count + TB balanced parallel) → card UI → CloseConfirm force checkbox + force param → close writes CLOSE audit with counts → integration smoke.

## Verification
Per slice: typecheck + slice vitest. Final: typecheck + full vitest 90+ + build 22 routes + manual close→reopen→post + activity REOPEN/CLOSE visible.

## Commits
- `chore(db): 00024 period lifecycle cols`
- `feat(periods): reopen with reason + audit + badge`
- `feat(periods): month-end checklist + gated close + CLOSE audit`
