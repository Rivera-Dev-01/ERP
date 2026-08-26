# Accountant User Guide — ERP V0

Desktop-first; use a wide window (≥1280px). All dates are `YYYY-MM-DD` in `Asia/Manila`; amounts are `₱` via `en-PH`.

## Sign in

- Open `/login`.
- Email: `accountant@v0.local` · Password: `demo-pass-123`.
- On success you land at `/dashboard?project=<id>` (first ACTIVE Project, typically **Example Client**). Switch Projects via the header **Project** dropdown (shows `name — client_name`); every tab preserves `?project=`.

## 30-second orientation

- **Sidebar:** Dashboard · Accounts · Journal · Imports · Reports · Activity · Projects · Settings.
- **Projects are isolated ledgers.** Each Project owns its own Accounts, Fiscal Periods, Journal Entries/Lines, Imports, Reports, and Activity. `JE-YYYY-XXXX` numbering is per Organization, not per Project.
- **Fresh Project:** New projects start with 0 accounts/journal entries/periods. Create a Fiscal Period at `/settings/periods?project=<newId>` (e.g., July 2026 `2026-07-01`–`2026-07-31` OPEN), then import or create Accounts before the first Journal Entry.

## Testing script (do without developer help after this orientation)

1. **Inspect dashboard** at `/dashboard?project=<id>`. Check pilot company name, current test period (`July 2026 Test Period` on Example Client), Draft/Posted counts, period-scoped Total debits/credits, and quick actions (New Journal Entry, Import Excel, View Trial Balance).
2. **Review Chart of Accounts** at `/accounts?project=<id>`. Search by Code/Name. For a new Project, download template `templates/chart-of-accounts.csv` and import via **Import CSV/XLSX** (headers: `Account Code, Account Name, Account Type, Normal Balance, Active`).
3. **Create five normal Journal Entries** at `/journal/new?project=<id>`: pick Entry date (must be in an OPEN period), Reference (1–60, auto-suggests `JE-YYYY-XXXX` but editable), Description. Add ≥2 lines: pick Account (active per Project), Line Description, **exactly one of** Debit or Credit positive, never both, no negatives. Watch the **sticky footer** `Total Debit / Total Credit / Difference` — Difference `₱0.00` shows green **Balanced**.
4. **Unbalanced attempt:** Intentionally make Total Debit ≠ Total Credit and try **Save Draft** → expect validation “Total debits must equal total credits”. Then **Post** → expect disabled until balanced.
5. **Post one entry:** On a balanced Draft, click **Post** → confirm dialog → expect `POSTED` badge, read-only view, `JE-YYYY-XXXX` assigned, `Posted at` shown, entry appears in `/journal?project=<id>` with **Total** and Status **POSTED** (paginated 50).
6. **Duplicate a Draft:** On `/journal?project=<id>` find a `DRAFT`, **Actions → Duplicate Draft** → expect new Draft with same lines and `-copy` reference; edit its date/amount and save.
7. **Reverse a Posted entry:** Open a `POSTED` entry → **Reverse** → pick reversal date in an OPEN period → confirm → expect original becomes `REVERSED` and a new `REVERSAL` Posted entry appears with debits↔credits swapped; both linked via `reversal_of_id`.
8. **Import a Journal spreadsheet** at `/imports?project=<id>` → **Journal Entries** card → **Import Journal CSV/XLSX** → pick `.csv` or `.xlsx` matching `templates/journal-entries.csv` headers (`Entry Group, Entry Date, Reference, Entry Description, Account Code, Line Description, Debit, Credit, Tax Code`). Submit → expect `rowErrors` panel if any group is unbalanced / account missing / date outside OPEN period; otherwise expect “Imported N journal groups” toast and Draft entries appear in `/journal?project=<id>` (valid imports are **never auto-posted**).
9. **Post the imported Drafts:** Open each imported Draft, verify lines, then **Post** one by one.
10. **Generate all five reports:** Open `/reports/trial-balance`, `/reports/income-statement`, `/reports/balance-sheet`, `/reports/general-journal`, `/reports/general-ledger?project=<id>&account=<id>`; set From/To to July 2026, filter by account if desired. Verify on Example Client: **Trial Balance `₱120,000.00` both sides**, **Income `₱20,000.00` – Expenses `₱8,000.00` = Net `₱12,000.00`**, **Balance Sheet Assets `₱112,000.00` = L0 + E `₱100,000.00` + CE `₱12,000.00`**.
11. **Export + Print:** On each report click **Export CSV** / **Export XLSX** (`/api/export/[report]?project=…`) and **Print** (browser Print → Save as PDF). Check PHP formatting `₱1,234.56`.
12. **Compare with Excel workbook:** Open the accountant’s approved workbook for July 2026 side-by-side; confirm every report amount matches. Record the answers below.

## Keyboard help (Journal line grid)

- **Enter** in any line field → next field in order `Account → Description → Debit → Credit → next row Account` (auto-creates a new row at the last row).
- **Shift+Enter** → previous field.
- **ArrowUp/Down** → same column, previous/next row.
- **Tab / Shift+Tab** still works for sequential navigation; Enter does not submit the form when focused inside the grid.

## Project & period tips

- Switching Projects via the header keeps the same page (`/journal?project=<otherId>` etc.). Refresh preserves it.
- If you see “Date not in any open period”, create or reopen a period at `/settings/periods?project=<id>` (one OPEN at a time per Project; overlap blocked by DB).
- If `Account Code` is rejected as duplicate, it’s per Project `(project_id,code)` — same code can exist in another Project.
- Deactivating an account used by N journal lines shows a warning but is allowed; historical reports still include it.

## Feedback questions (from the spec)

- Which task was slower than Excel?
- Which field or label was confusing?
- Was account search fast enough?
- Did the journal grid support the normal encoding flow?
- Did any report amount differ from Excel?
- Was it easy to locate the source entry behind a report figure?
- What is the single most important missing feature?
- Would you use this for another parallel reporting period?

## Where to look next

- **Activity** at `/activity?project=<id>` — audit log of POST/REVERSED/IMPORT (last 50, paginated).
- **Imports** templates: `templates/chart-of-accounts.csv` + `templates/journal-entries.csv` (both accept `.xlsx` too).
- **Deliverables & limitations:** see `README.md` “Known limitations” and `docs/superpowers/specs/2026-08-19-erp-v0-design.md` §15.

## Support

Issues at https://github.com/anomalyco/opencode — mention you are using Meta Muse Spark. For access issues, re-run `npx supabase db push` and re-seed `supabase/seed.sql` in the SQL Editor.
