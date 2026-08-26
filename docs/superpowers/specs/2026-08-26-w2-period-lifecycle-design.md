# W2 — Period Lifecycle — Design Spec

Date: 2026-08-26
Status: Approved (warn+force, any period)
Source: User feature list §2 gaps + audit 2026-08-26

## Goal
Close the fiscal-period lifecycle: make periods one-way by default but audited-reopenable with a recorded reason, and make month-end close a checklist the accountant can choose to force through.

## Non-goals
Auto carry-forward (inherent), bank rec gating (W5), workpapers/tax, saved mappings, adjusted TB separate.

## Decisions
- Close gating: warn + "Force close anyway" checkbox (accountant autonomy, decision audited).
- Reopen scope: any CLOSED period may be reopened with reason; full audit trail in `audit_event`.

## Data
- `fiscal_period`: add `reopened_at timestamptz`, `reopened_by_id uuid references profile(id)`, `reopened_reason text`.
- `closed_at` stays as last-close time; reopen sets status OPEN + who/when/why.
- Audit events: `REOPEN` {reason}, `CLOSE` {draft_count, tb_balanced, forced}.

## S1 — Reopen
- Migration 00024 adds three columns + index.
- `reopenFiscalPeriod` dual-arity (form action + useActionState), validates CLOSED + reason 5-500 chars, sets OPEN + fields, inserts audit_event.
- UI: `ReopenDialog` on CLOSED rows; `Reopened` badge on OPEN rows with reason.
- Overlap safe via existing exclude gist.

## S2 — Checklist
- Server on `/settings/periods?company=`: for each OPEN period, parallel draft count (`journal_entry status DRAFT` in range) + `getTrialBalance(from,to).isBalanced`.
- Card per OPEN period with pass/fail badges linking to fix.
- `CloseConfirm` receives checks; red → "Force close anyway" checkbox required; `closeFiscalPeriod` accepts force flag and writes CLOSE audit with counts.
- Tests: unit reason schema, integration close→reopen→post, checklist smoke.

## Risks
Migration adds nullable cols — no rewrite, safe. Posting into reopened period works via existing OPEN check.

## Out of scope
W3 Cash Flow, W4 attachments, W5 recon.
