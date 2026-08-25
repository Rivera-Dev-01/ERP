# Phase 3 — PM-Orchestrated Execution Map

Spec: `docs/superpowers/specs/2026-08-26-phase3-journal-engine-design.md`
Plan: `docs/superpowers/plans/2026-08-26-phase3-journal-engine.md`
Workflow: `~/.agents/skills/workflow/SKILL.md` — Execution Modes → PM-Orchestrated

## Roles

- **PM (persistent):** owns contract + blackboard (`docs/superpowers/plans/.phase3-blackboard.md`), the plan's `Files:` matrix, and every gate. Check-and-gate with fix via Reconciliation lane. Never invents feature logic beyond plan code blocks.
- **Workers (ephemeral, parallel within a slice):** touch only their slice's files; MUST import the contract; report Touched/Evidence/Open.
- **Reconciler (on-demand):** normalizes predicates that live in two places (Zod `isBalanced` vs PL/pgSQL `SUM(debit)=SUM(credit)`).

## Contract (Slice 0 — PM, sequential, ~5 min)

Frozen before any slice worker starts:
- `src/lib/validation/journal.ts` — `journalSchema` (entry_date YYYY-MM-DD, reference 1–60, description 1–200, notes optional, lines `journalLineSchema` min 2 + `superRefine` balance) + `formatEntryNumber(n, date)` → `JE-YYYY-XXXX` or `—`.
- `src/server/domain/journals.ts` — `canPost`, `canReverse`, `resolveFiscalPeriodId`, shared `isBalanced` re-export.
- Audit shape: `{ entry_number: "JE-YYYY-XXXX", total_debit, total_credit, line_count }`.

## Lane Map (parallel within slice, staged merges in dependency order)

### Slice A — Draft CRUD + hotkey grid
- A1-domain: `lib/validation/journal.ts` bodies + `tests/unit/domain/journals.test.ts` (journalSchema balance, line xor)
- A2-grid: `AccountPicker.tsx` + `LineGrid.tsx` (Tab/Enter/Esc/Up/Down, sticky footer) + `JournalForm.tsx` shell
- A3-pages: `src/server/actions/journal-actions.ts` (upsert/duplicate/delete only) + `src/app/(app)/journal/new/page.tsx` + `src/app/(app)/journal/[id]/page.tsx` (editable path) + `tests/integration/journal-draft.test.ts`
- PM merge A → `typecheck` → `vitest run tests/unit/domain/journals.test.ts` → commit `feat(journal): draft CRUD + grid (Slice A)`

### Slice B — Sequence + Post RPC
- B1-db: `supabase/migrations/00010_sequences.sql` (journal_entry_sequence per org) + `00011_post_journal_entry.sql` (SECURITY DEFINER, FOR UPDATE on sequence+entry, re-checks Zod predicates)
- B2-action: `postJournalEntry` rpc caller + `PostConfirm.tsx` + read-only posted view slot
- PM + Reconciler → `supabase db push` → `cmd gen types` → typecheck → diff PL/pgSQL vs Zod balance → normalize to `numeric(19,4)` → `vitest run tests/integration/journal-post.test.ts` slice B → commit

### Slice C — Reversal + Audit
- C1-db: `00012_reverse_journal_entry.sql` (reuses sequence, swapped lines, marks original REVERSED)
- C2-ui: `ReverseDialog.tsx` (date default today, swapped preview) + `reverseJournalEntry` action
- PM merge C → typecheck → vitest (reversal + audit_event line_count) → commit

### Slice D — Register + filters
- D1-register: `JournalTable.tsx` (TanStack, date/status/account/text) + `/journal/page.tsx`
- D2-e2e: `e2e/journal.spec.ts` (draft→post→read-only→reverse) + README Phase 3
- PM final sweep: `typecheck && lint && vitest run && build && playwright --workers=1` → commit polish

## Gates

- Per-worker: `npx vitest run <lane tests>` + `tsc --noEmit` on lane subset.
- Per-merge: `npm run typecheck && npm run lint` (PM checks `git diff --stat` vs matrix; `git add <slice files>` only, never `add -A` across slices).
- Final: full sweep as above before any "done" claim.

## Blackboard

Append-only `docs/superpowers/plans/.phase3-blackboard.md`:
- PM posts "Contract frozen" / "Slice N merged green"
- Workers post "Touched: <paths> | Evidence: <typecheck/vitest> | Open: <cross-slice needs>"
