# ERP Accounting

A desktop-first web accounting prototype for a single pilot company in the Philippines. One accountant encodes journal entries per Project (client engagement), each with its own chart of accounts and fiscal period, and generates per-Project financial reports that must match an existing Excel workbook.

## Language

### Core

**Organization**:
The pilot company whose financial records are being kept. V0 exposes one organization at a time; every owned row carries `organization_id` for future multi-org support. Since Projects, the organization owns multiple isolated Projects.
_Avoid_: Company, Tenant

**Project**:
A self-dependent client engagement inside one Organization. Each Project owns its own Chart of Accounts, Fiscal Periods, Journal Entries/Lines, Import Batches, and Reports; nothing is shared across Projects. Code uniqueness is per Project `(project_id, code)`, period overlap is per Project, and reports are filtered by `project_id`. `JE-YYYY-XXXX` entry numbering stays per Organization (`journal_entry_sequence.organization_id`). Query via `?project=<uuid>` flat param, defaulting to the first ACTIVE Project (Example Client).
_Avoid_: Client (in code use Project), Workspace, Engagement (use Project)

**Fiscal Period**:
A named calendar slice (e.g., July 2026) with `start_date`, `end_date`, and `status` OPEN or CLOSED. Closing is one-way in V0. Since Projects, scoped per Project `(project_id, daterange)`.
_Avoid_: Accounting Period, Reporting Period (use Fiscal Period)

**Account**:
A row in the Chart of Accounts. Identified by a numeric `code` unique per Project `(project_id, code)`, with `type` and `normal_balance`.
_Avoid_: Ledger, GL Account (use Account)

**Chart of Accounts**:
The full set of Accounts for one Project, ordered by `code`. V0 imports it from CSV per Project and deactivates — not deletes — accounts.
_Avoid_: COA abbreviation in UI (spell it out)

**Journal Entry**:
A dated collection of Journal Lines that must balance (total debits = total credits) before it can be Posted.
_Avoid_: Transaction, Voucher, Entry (alone) — always say Journal Entry

**Journal Line**:
One side of a Journal Entry. Carries exactly one positive amount — either `debit` or `credit` — referencing one active Account.
_Avoid_: Line item, Entry detail

**Entry Number**:
The formatted system identifier `JE-YYYY-XXXX` assigned per organization at posting via a `FOR UPDATE` sequence; the numeric suffix is the stored `entry_number` for uniqueness.
_Avoid_: Reference, Entry ID

**Reference**:
The document reference shown to the accountant, auto-suggested as the Entry Number at creation but editable (1–60 chars) and stored as `reference`.
_Avoid_: Entry Number (use separately), Voucher No.

**Trial Balance**:
A per-account report of opening, period, and ending debits/credits with the invariant Total Ending Debits = Total Ending Credits; derived from posted lines only.
_Avoid_: Trial Bal, TB

**Income Statement**:
A period report grouping INCOME as credits-debits and EXPENSE as debits-credits, with Net Income = Income - Expenses.
_Avoid_: P&L, Profit and Loss (use Income Statement)

**Balance Sheet**:
An as-of report where Assets = debits-credits (ASSET), Liabilities/Equity = credits-debits, and Assets = Liabilities + Equity + Current Earnings via Income-Expenses through the date.
_Avoid_: Statement of Financial Position (use Balance Sheet)

**Import Batch**:
The audit record of a CSV/XLSX import, tracking `file_name`, row counts, and per-row errors before any rows are committed.
_Avoid_: Upload, Batch (alone)

### Accounting

**Posting**:
The one-transaction RPC that validates a DRAFT Journal Entry and marks it POSTED, assigning its `entry_number` and writing an Audit Event. Only server-side posting is valid.
_Avoid_: Approving, Confirming

**Reversal**:
A new POSTED Journal Entry that copies an earlier POSTED entry with debits and credits swapped and links back via `reversal_of_id`; the original becomes REVERSED only after the reversal posts.
_Avoid_: Voiding, Canceling

**Normal Balance**:
The side (DEBIT or CREDIT) that increases an Account. ASSET/EXPENSE are typically DEBIT; LIABILITY/EQUITY/INCOME typically CREDIT — but V0 allows any `normal_balance` per Account.
_Avoid_: Default balance

### Auth

**Accountant**:
The V0 membership role (`membership_role = ACCOUNTANT`). The only authenticated actor in V0.
_Avoid_: User (use Accountant or Profile when referring to the person vs the row), Admin
