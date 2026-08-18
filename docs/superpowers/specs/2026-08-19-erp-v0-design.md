# ERP V0 — Design Specification

Date: 2026-08-19
Status: Ready for review

## 1. Product definition

Build a **desktop-first web accounting prototype** that allows one accountant to manage one pilot company for one accounting period, enter or import journal entries, post balanced transactions, and generate financial reports that match an existing Excel workbook.

### V0 objective

The V0 must answer three questions:

1. Can the accountant encode normal journal entries as quickly and comfortably as in Excel?
2. Do the General Ledger, Trial Balance, Income Statement, and Balance Sheet match the accountant's approved workbook?
3. Can existing spreadsheet data be imported, reviewed, corrected, and posted safely?

### Test boundary

- One authenticated accountant
- One visible pilot company
- One Chart of Accounts
- One completed month used as the comparison period
- Approximately 10–100 anonymized journal entries
- Philippine peso as the display currency
- Business timezone: `Asia/Manila`

The database must include an `organizationId` on company-owned records so multi-company support can be added later, even though the V0 interface exposes only one company.

### Source of truth

The Notion planner (provided by the product owner) is authoritative. If a requested convenience conflicts with accounting integrity, preserve accounting integrity. Do not silently broaden the feature set.

## 2. Fixed V0 scope

### Must include

- Secure login for one test accountant
- Basic company profile
- Chart of Accounts management
- Chart of Accounts CSV/XLSX import
- Manual journal-entry workspace
- Draft, Posted, and Reversed statuses
- Double-entry validation
- Journal-entry reversal
- Excel/CSV journal import into Draft status
- General Journal
- General Ledger
- Trial Balance
- Income Statement
- Balance Sheet
- Date and account filters
- Excel/CSV export
- Printable report view that can be saved as PDF
- Minimal activity history
- Seeded demo data
- Automated tests for accounting rules and reports

### Optional only after all acceptance tests pass

- Opening-balance import through a special opening journal
- Recurring journal templates
- Supporting-document attachment
- Report drill-down from an amount to journal lines
- Basic dashboard totals
- Optional tax-code tag stored on journal lines without tax calculations

### Explicitly out of scope

- Direct BIR filing or submission
- BIR form generation
- EIS or electronic-invoicing integration
- Automated VAT, percentage-tax, or withholding-return computation
- Customers, suppliers, invoices, collections, and bills as separate subledgers
- Accounts Receivable and Accounts Payable automation
- Bank reconciliation
- Inventory
- Payroll
- Fixed assets and depreciation
- Multi-company switching in the interface
- Multiple approval levels
- Client portal
- Native mobile application
- OCR or AI document extraction
- Microservices

## 3. Chosen web technology stack

Use a **Next.js TypeScript web application with Supabase as the managed backend**. TanStack Table remains the frontend table engine; Supabase provides the database, authentication, authorization, and future file storage.

### Application

- **Framework:** Next.js with App Router
- **Language:** TypeScript with strict mode enabled
- **UI:** React, Tailwind CSS, and shadcn/ui
- **Forms:** React Hook Form with Zod validation
- **Data tables:** TanStack Table for the Chart of Accounts, journal register, entry grid, and financial reports
- **Supabase clients:** `@supabase/ssr` and `@supabase/supabase-js`
- **Server architecture:** Next.js Server Actions or route handlers using a server-side Supabase client, organized as a modular monolith
- **Exact decimals:** `decimal.js`

### Supabase backend

- **Platform:** Supabase
- **Database:** Supabase PostgreSQL
- **Authentication:** Supabase Auth with one seeded test accountant
- **Authorization:** PostgreSQL Row-Level Security plus server-side organization-membership checks
- **Schema and migrations:** Versioned SQL migrations managed through the Supabase CLI
- **Type safety:** Generate TypeScript database types from the Supabase schema
- **Future document storage:** Supabase Storage; defer attachments until the optional V0 scope
- **Money columns:** PostgreSQL `NUMERIC(19,4)`; convert values through `decimal.js` rather than JavaScript floating-point arithmetic
- **Business dates:** PostgreSQL `DATE`
- **System timestamps:** UTC timestamps; format business dates using `Asia/Manila`
- **Secret handling:** The Supabase service-role key must never be exposed to the browser

### Accounting transaction rule

- Ordinary Draft editing may use validated server-side CRUD operations.
- Posting and reversal must execute through PostgreSQL functions called from server-only Supabase RPC operations.
- Each posting or reversal function must validate authorization and accounting rules, lock the relevant record, update all affected rows, write the audit event, and commit or roll back as one database transaction.
- Never post a journal entry through separate browser requests for individual journal lines.

### Import, export, and printing

- **Excel/CSV:** ExcelJS for workbook parsing and generation
- **Printable reports:** Dedicated print layout and browser Print to PDF for V0
- **Number formatting:** `Intl.NumberFormat` using `en-PH` and `PHP`

### Quality and deployment

- **Unit/integration tests:** Vitest
- **End-to-end tests:** Playwright
- **Code quality:** ESLint and Prettier
- **Local backend workflow:** Supabase CLI with local migrations and seed data
- **Packaging:** Dockerfile and `.env.example`
- **Deployment:** Managed Next.js hosting connected to a hosted Supabase project

Do not introduce Prisma, Auth.js, Redux, event buses, queues, microservices, or a second backend framework in V0.

## 4. Required pages and routes

### `/login`

- Email and password
- Generic invalid-credential message
- Redirect authenticated users to the dashboard

### `/dashboard`

Keep this minimal:

- Pilot company name
- Current test period
- Count of Draft and Posted entries
- Current total debits and credits for the selected period
- Quick actions: New Journal Entry, Import Excel, View Trial Balance

### `/accounts`

- Searchable Chart of Accounts table
- Columns: Code, Account Name, Type, Normal Balance, Active
- Create and edit an account
- Disable an account without deleting it
- Import accounts from CSV/XLSX
- Reject duplicate account codes within the company

### `/journal`

- Search and filter by date, status, account, reference, and description
- Columns: Entry Number, Date, Reference, Description, Status, Total, Updated At
- Actions: Open, Duplicate Draft, Post Draft, Reverse Posted Entry
- Posted entries must not show Edit or Delete actions

### `/journal/new` and `/journal/[id]`

Header fields:

- Entry date
- Reference number
- Description
- Optional notes

Journal-line grid:

- Account code and name
- Optional line description
- Debit
- Credit
- Optional tax-code tag
- Add, duplicate, and remove line

Behavior:

- At least two lines are required.
- Each line must contain either a positive debit or a positive credit, never both.
- Zero-value lines are rejected.
- Display running Total Debit, Total Credit, and Difference in a sticky footer.
- Disable Post until the entry is balanced and valid.
- Drafts may be edited and deleted.
- Posted entries are read-only.
- Reversal creates a new posted entry with debit and credit values swapped and links both entries.

### `/imports`

- Upload CSV or XLSX
- Choose import type: Chart of Accounts or Journal Entries
- Preview the first rows
- Map uploaded columns to required fields
- Validate before saving
- Display row-level errors
- Show total debit, total credit, and difference for journal imports
- Save valid journal imports as Draft entries only
- Store an import-batch record for traceability

### Report routes

- `/reports/general-journal`
- `/reports/general-ledger`
- `/reports/trial-balance`
- `/reports/income-statement`
- `/reports/balance-sheet`

Every report must include:

- Company name
- Report title
- Date or period covered
- Generated timestamp
- Filters
- PHP currency formatting
- Print view
- Excel or CSV export

## 5. Data model

Use PostgreSQL tables created through versioned Supabase SQL migrations. Exact table names may follow repository conventions, but the relationships, constraints, RLS policies, and accounting controls are required.

### Supabase Auth user and `Profile`

Supabase manages credentials in `auth.users`; the application must never store or handle password hashes directly.

- `id` — UUID primary key referencing `auth.users.id`
- `name`
- `createdAt`
- `updatedAt`

Authentication email remains managed by Supabase Auth. Application tables that reference a user should reference `Profile.id`.

### `Organization`

- `id`
- `name`
- `legalName`
- `currencyCode` — default `PHP`
- `timezone` — default `Asia/Manila`
- `fiscalYearStartMonth`
- Optional `tin`, `rdo`, and `taxClassification`
- `createdAt`
- `updatedAt`

### `OrganizationMembership`

- `id`
- `organizationId`
- `userId`
- `role` — V0 value: `ACCOUNTANT`
- Unique pair: `organizationId + userId`

### `FiscalPeriod`

- `id`
- `organizationId`
- `name`
- `startDate`
- `endDate`
- `status` — `OPEN` or `CLOSED`
- `closedAt`
- Unique period range validation per organization

### `Account`

- `id`
- `organizationId`
- `code`
- `name`
- `type` — `ASSET`, `LIABILITY`, `EQUITY`, `INCOME`, or `EXPENSE`
- `normalBalance` — `DEBIT` or `CREDIT`
- `isActive`
- `createdAt`
- `updatedAt`
- Unique pair: `organizationId + code`

Default normal balances:

- Asset and Expense → Debit
- Liability, Equity, and Income → Credit

### `JournalEntry`

- `id`
- `organizationId`
- `fiscalPeriodId`
- `entryNumber`
- `entryDate`
- `reference`
- `description`
- Optional `notes`
- `status` — `DRAFT`, `POSTED`, or `REVERSED`
- `entryType` — `STANDARD`, `OPENING`, `ADJUSTING`, or `REVERSAL`
- Optional `reversalOfId`
- `totalDebit`
- `totalCredit`
- `createdById`
- Optional `postedById`
- Optional `postedAt`
- `createdAt`
- `updatedAt`
- Unique pair: `organizationId + entryNumber`

### `JournalLine`

- `id`
- `journalEntryId`
- `accountId`
- `lineNumber`
- Optional `description`
- `debit` — Decimal, default zero
- `credit` — Decimal, default zero
- Optional `taxCode`

### `ImportBatch`

- `id`
- `organizationId`
- `fileName`
- `importType`
- `status`
- `rowCount`
- `validRowCount`
- `invalidRowCount`
- `createdById`
- `createdAt`

### `AuditEvent`

- `id`
- `organizationId`
- `userId`
- `entityType`
- `entityId`
- `action`
- Optional structured `metadata`
- `createdAt`

Do not store account balances as mutable fields. Calculate balances from posted journal lines so reports cannot drift from the ledger.

## 6. Accounting business rules

### Journal validation

A journal entry can be posted only when all conditions are true:

- The user has access to the organization.
- The entry date belongs to an open fiscal period.
- At least two journal lines exist.
- Every line references an active account.
- Every line has exactly one positive amount: debit or credit.
- No amount is negative.
- Total debit equals total credit using exact decimal arithmetic.
- Total debit is greater than zero.
- Required header fields are present.

### Posting

Posting must occur through a server-only Supabase RPC backed by one PostgreSQL transaction, such as `post_journal_entry(entry_id)`:

1. Verify the authenticated user belongs to the journal entry's organization.
2. Lock the journal entry row for update.
3. Reload the entry and its lines from the database.
4. Confirm the entry is still Draft and its fiscal period is Open.
5. Re-run all line, account, date, and debit-credit validations inside PostgreSQL.
6. Assign the next organization entry number without allowing concurrent duplicates.
7. Save exact total debit and credit values.
8. Change status to Posted and record the posting user and timestamp.
9. Write the audit event.
10. Commit every change together or roll everything back on failure.

Never rely only on client-side validation, and never post a journal through separate line-by-line requests from the browser.

### Editing and deletion

- Draft entries may be edited or deleted.
- Posted entries may not be edited or deleted through the interface or application service.
- Closed-period entries may not be created, modified, posted, or reversed.
- Account deletion is not permitted. Accounts may be deactivated only.
- An account used by a journal line may not be deactivated without a warning, but historical reports must continue to include it.

### Reversal

A reversal must:

- Create a new journal entry.
- Copy the original lines with debit and credit swapped.
- Use the chosen reversal date in an open period.
- Reference the original entry.
- Be posted through the normal posting service.
- Mark the original as Reversed only after the reversal posts successfully.
- Preserve both records and write audit events.

### Opening balances

If implemented, opening balances must be represented by a balanced `OPENING` journal entry. Do not store opening balances directly on account records.

## 7. Import specifications

### Chart of Accounts template

Required columns:

```
Account Code, Account Name, Account Type, Normal Balance, Active
```

Validation:

- Account Code and Account Name are required.
- Account Type must match a supported enum.
- Account Code must be unique within the company.
- Normal Balance must be Debit or Credit.
- Show all validation errors before committing the import.

### Journal-entry template

Required columns:

```
Entry Group, Entry Date, Reference, Entry Description, Account Code, Line Description, Debit, Credit, Tax Code
```

Rules:

- Rows sharing `Entry Group` belong to one journal entry.
- Every Entry Group must have at least two lines.
- Entry Date must be a valid business date in an open period.
- Account Code must exist and be active.
- Debit and Credit must parse as exact decimal values.
- Every Entry Group must balance independently.
- All imported entries are created as Draft.
- If one group fails, report its errors without posting any entries.
- Display a final import summary before confirmation.

## 8. Report specifications

All official financial reports use **Posted entries only**. Draft entries may appear in the General Journal only when the user explicitly selects a Draft filter.

### General Journal

Display journal entries chronologically with:

- Entry number
- Date
- Reference
- Description
- Account code and name
- Debit and credit
- Status

### General Ledger

For each account, show:

- Opening balance before the selected start date
- Date, entry number, reference, and description
- Debit and credit movement
- Running balance
- Ending balance

Calculate running balance using the account's normal balance.

### Trial Balance

For every account with an opening balance or period activity, show:

- Account code
- Account name
- Opening debit or credit
- Period debit
- Period credit
- Ending debit or credit

The report must display a visible control confirming:

```
Total Ending Debits = Total Ending Credits
```

### Income Statement

For the selected period:

```
Income = Credits - Debits for INCOME accounts
Expenses = Debits - Credits for EXPENSE accounts
Net Income = Total Income - Total Expenses
```

Group by account type and list account-level totals.

### Balance Sheet

As of the selected date:

```
Assets = Debits - Credits for ASSET accounts
Liabilities = Credits - Debits for LIABILITY accounts
Equity = Credits - Debits for EQUITY accounts
Current Earnings = Income - Expenses through the report date
Assets = Liabilities + Equity + Current Earnings
```

Display a visible balance check. Do not hide an out-of-balance result.

## 9. UX requirements

- Desktop-first, responsive enough for tablet viewing
- Clean accountant-oriented layout; avoid decorative dashboard complexity
- Fast keyboard navigation across the journal-line grid
- Account search by code or name
- Automatically move to the next row after completing a line
- Sticky debit, credit, and difference totals
- Clear inline validation messages
- Confirmation before posting or reversing
- PHP formatting such as `₱1,234.56`
- ISO-style date storage with a familiar date picker in the interface
- Preserve entered Draft data when a validation error occurs
- Empty states must explain the next action
- Loading, success, and error states for every mutation

## 10. Seed data and accounting test fixture

Create one demo organization named **V0 Accounting Demo** and seed the following accounts:

- `1000` Cash in Bank — Asset, Debit
- `1100` Accounts Receivable — Asset, Debit
- `3000` Owner's Capital — Equity, Credit
- `4000` Service Revenue — Income, Credit
- `5000` Office Supplies Expense — Expense, Debit
- `5100` Utilities Expense — Expense, Debit

Seed these posted transactions in one open test period:

1. Owner investment: Debit Cash `100000`; Credit Owner's Capital `100000`.
2. Office supplies paid in cash: Debit Office Supplies Expense `5000`; Credit Cash `5000`.
3. Service provided on account: Debit Accounts Receivable `20000`; Credit Service Revenue `20000`.
4. Customer collection: Debit Cash `10000`; Credit Accounts Receivable `10000`.
5. Utilities paid in cash: Debit Utilities Expense `3000`; Credit Cash `3000`.

Expected ending Trial Balance:

- Cash in Bank — Debit `102000`
- Accounts Receivable — Debit `10000`
- Office Supplies Expense — Debit `5000`
- Utilities Expense — Debit `3000`
- Owner's Capital — Credit `100000`
- Service Revenue — Credit `20000`
- Total Debits — `120000`
- Total Credits — `120000`

Expected reports:

- Total Income — `20000`
- Total Expenses — `8000`
- Net Income — `12000`
- Total Assets — `112000`
- Liabilities plus Equity including current earnings — `112000`

Use these exact expected results in automated report tests.

## 11. Required automated tests

### Accounting service tests

- Balanced entry posts successfully.
- Unbalanced entry is rejected.
- Entry with fewer than two lines is rejected.
- Line containing both debit and credit is rejected.
- Zero-value entry is rejected.
- Posting into a closed period is rejected.
- Posted entry cannot be edited or deleted.
- Reversal swaps debit and credit correctly.
- Concurrent posting does not create duplicate entry numbers.

### Report tests

- Seeded Trial Balance totals equal `120000` on both sides.
- Seeded Income Statement returns `12000` net income.
- Seeded Balance Sheet balances at `112000`.
- Draft entries are excluded from financial reports.
- Reversed activity remains visible and nets correctly.
- Date filters include and exclude boundary dates correctly.

### Import tests

- Valid Chart of Accounts file imports successfully.
- Duplicate account codes are rejected.
- Unknown journal account codes are reported.
- Unbalanced Entry Groups are rejected.
- Valid journal imports are created as Draft, never Posted.

### End-to-end test

Automate this critical path:

1. Sign in.
2. Create a balanced Draft journal entry.
3. Post it.
4. Confirm it is read-only.
5. Open the Trial Balance.
6. Confirm the entry changed the correct balances.
7. Reverse the posted entry.
8. Confirm the net report effect is zero.

## 12. Accountant testing script

The tester should use anonymized data and complete the following without developer assistance after a short orientation:

1. Sign in and inspect the pilot-company dashboard.
2. Import or review the Chart of Accounts.
3. Create five normal journal entries.
4. Intentionally attempt to post an unbalanced entry.
5. Correct and post the entry.
6. Duplicate a Draft entry and edit its date and amount.
7. Reverse one Posted entry.
8. Import a small journal spreadsheet.
9. Review and post the valid imported Drafts.
10. Generate all five reports.
11. Export the Trial Balance and Income Statement.
12. Compare report balances with the existing Excel workbook.

### Tester feedback questions

- Which task was slower than Excel?
- Which field or label was confusing?
- Was account search fast enough?
- Did the journal grid support the normal encoding flow?
- Did any report amount differ from Excel?
- Was it easy to locate the source entry behind a report figure?
- What is the single most important missing feature?
- Would the tester use this for another parallel reporting period?

## 13. V0 acceptance criteria

The V0 is accepted only when:

- The accountant can encode entries without developer assistance.
- Invalid and unbalanced entries cannot be posted.
- Posted entries cannot be silently edited or deleted.
- The seeded Trial Balance, Income Statement, and Balance Sheet match the expected figures.
- An anonymized real-world test period matches the accountant-approved Excel reports.
- Imported journal entries remain Draft until reviewed and posted.
- Users cannot access protected pages without authentication.
- All organization-owned queries are scoped by `organizationId` on the server.
- Reports export successfully and remain readable when printed to PDF.
- Automated accounting and report tests pass.
- The application completes one successful parallel reporting cycle before real operational use.

## 14. Implementation order

### Phase 1 — Foundation

- Initialize the Next.js TypeScript project.
- Configure Tailwind, shadcn/ui, TanStack Table, Supabase SSR clients, Vitest, and Playwright.
- Initialize the Supabase CLI project with versioned SQL migrations and seed data.
- Add `.env.example`, generated database types, and README.
- Implement Supabase Auth, the Profile table, organization membership, and Row-Level Security policies.
- Verify that users cannot read or modify records outside their organization.

### Phase 2 — Accounting master data

- Implement company profile, fiscal period, and Chart of Accounts.
- Add account create/edit/deactivate and import.
- Seed the demo organization and accounts.

### Phase 3 — Journal engine

- Implement journal-entry Draft workflow and keyboard-friendly line grid.
- Implement the server-side validation and posting transaction.
- Implement reversal and audit events.
- Add accounting service tests before continuing.

### Phase 4 — Reports

- Implement General Journal, General Ledger, Trial Balance, Income Statement, and Balance Sheet.
- Add the seeded expected-result tests.
- Add date/account filters, exports, and print layouts.

### Phase 5 — Journal import

- Implement upload, preview, mapping, validation, import batches, and Draft creation.
- Add row-level error export.

### Phase 6 — User testing release

- Run all tests.
- Deploy a staging build.
- Create the sample login and anonymized test company.
- Provide the accountant testing script.
- Record issues without expanding the scope during the test.

## 15. Required project deliverables

- Working web application source code
- Database schema and versioned migrations
- Demo seed script
- Automated unit, integration, and end-to-end tests
- CSV/XLSX import templates
- `.env.example`
- Dockerfile
- README containing local setup, migration, seed, test, and deployment commands
- Staging deployment instructions
- Test account setup instructions
- Short accountant user guide
- Known limitations and deferred-features list

## 16. Approved file structure

Locked with the product owner on 2026-08-19.

```
D:\ERP\
├─ supabase/
│  ├─ config.toml
│  ├─ migrations/                     # versioned SQL, in dependency order
│  │  ├─ 00001_extensions.sql
│  │  ├─ 00002_profile.sql            # references auth.users
│  │  ├─ 00003_organization.sql       # Organization + OrganizationMembership
│  │  ├─ 00004_fiscal_period.sql
│  │  ├─ 00005_account.sql            # unique (organizationId, code)
│  │  ├─ 00006_journal_entry.sql      # JournalEntry + JournalLine
│  │  ├─ 00007_import_batch.sql
│  │  ├─ 00008_audit_event.sql
│  │  ├─ 00009_rls_policies.sql       # all RLS policies
│  │  ├─ 00010_sequences.sql          # per-org entry numbering
│  │  ├─ 00011_post_journal_entry.sql     # RPC: single-transaction posting
│  │  └─ 00012_reverse_journal_entry.sql
│  └─ seed.sql                        # V0 Accounting Demo + 6 accounts + 5 posted entries
├─ templates/
│  ├─ chart-of-accounts.csv
│  └─ journal-entries.csv
├─ src/
│  ├─ middleware.ts                   # session refresh + auth redirect
│  ├─ app/
│  │  ├─ layout.tsx / globals.css
│  │  ├─ (auth)/login/page.tsx
│  │  ├─ (app)/                       # authenticated layout: nav + org-scoped data
│  │  │  ├─ layout.tsx
│  │  │  ├─ dashboard/page.tsx
│  │  │  ├─ accounts/page.tsx
│  │  │  ├─ journal/
│  │  │  │  ├─ page.tsx               # register
│  │  │  │  ├─ new/page.tsx
│  │  │  │  └─ [id]/page.tsx          # draft edit / posted read-only
│  │  │  ├─ imports/page.tsx
│  │  │  └─ reports/
│  │  │     ├─ general-journal/page.tsx
│  │  │     ├─ general-ledger/page.tsx
│  │  │     ├─ trial-balance/page.tsx
│  │  │     ├─ income-statement/page.tsx
│  │  │     └─ balance-sheet/page.tsx
│  │  └─ api/export/[report]/route.ts # Excel/CSV download (streams binary)
│  ├─ components/
│  │  ├─ ui/                          # shadcn/ui primitives
│  │  ├─ data-table/                  # TanStack wrapper: DataTable, ColumnHeader, Toolbar
│  │  ├─ layout/                      # Sidebar, Header
│  │  ├─ shared/                      # EmptyState, MoneyText, DatePicker, ConfirmDialog
│  │  ├─ accounts/                    # AccountsTable, AccountForm, ImportButton
│  │  ├─ journal/                     # EntryForm, LineGrid, StatusBadge, ReversalDialog
│  │  ├─ imports/                     # UploadDropzone, MappingWizard, PreviewTable, ErrorPanel
│  │  └─ reports/                     # ReportHeader, FilterBar, ReportTable, PrintLayout
│  ├─ lib/                            # shared client+server (never secrets)
│  │  ├─ supabase/client.ts
│  │  ├─ constants.ts                 # types, statuses, tax codes
│  │  ├─ money.ts                     # decimal.js exact arithmetic
│  │  ├─ format.ts                    # Intl en-PH / PHP / Asia/Manila
│  │  └─ validation/                  # Zod schemas shared by client + server
│  ├─ server/                         # server-only (imports `server-only`)
│  │  ├─ supabase/server.ts
│  │  ├─ auth.ts                      # session + org-membership guard
│  │  ├─ actions/
│  │  │  ├─ auth-actions.ts
│  │  │  ├─ account-actions.ts
│  │  │  ├─ journal-actions.ts        # save/delete draft, post, reverse (RPC calls)
│  │  │  └─ import-actions.ts
│  │  ├─ domain/
│  │  │  ├─ accounts.ts
│  │  │  ├─ fiscal-periods.ts
│  │  │  └─ journal.ts                # validation + numbering rules (tested)
│  │  ├─ reports/
│  │  │  ├─ balances.ts               # shared engine: posted lines → balances
│  │  │  ├─ general-journal.ts
│  │  │  ├─ general-ledger.ts
│  │  │  ├─ trial-balance.ts
│  │  │  ├─ income-statement.ts
│  │  │  └─ balance-sheet.ts
│  │  └─ imports/
│  │     ├─ parser.ts                 # CSV/XLSX (ExcelJS) → rows
│  │     ├─ coa-import.ts
│  │     ├─ journal-import.ts         # Entry Group validation
│  │     └─ export.ts                 # report → Excel/CSV bytes
│  └─ types/database.ts               # generated Supabase types
├─ tests/                             # Vitest
│  ├─ setup.ts
│  ├─ unit/domain/                    # journal rules, money, numbering
│  ├─ integration/reports/            # seeded: 120000 / 12000 / 112000
│  └─ integration/imports/
├─ e2e/                               # Playwright
│  ├─ critical-path.spec.ts           # sign-in → draft → post → reverse → net zero
│  ├─ auth.spec.ts
│  └─ support/helpers.ts
├─ .env.example / .gitignore / .prettierrc
├─ components.json                    # shadcn/ui
├─ next.config.ts / tsconfig.json / eslint.config.mjs
├─ vitest.config.ts / playwright.config.ts
├─ Dockerfile
└─ README.md                          # setup, migration, seed, test, deploy commands
```

## 17. Locked implementation decisions

Recorded during design review; change only with product-owner approval.

1. **RPC functions live in migrations** (`00011`/`00012`), not `supabase/functions/` — that directory is for Deno Edge Functions, which V0 does not use.
2. **Server Actions for all mutations**; a single route handler (`/api/export/[report]`) only for binary file downloads (Excel/CSV).
3. **Tests colocated by domain** under `tests/` (`unit/` vs `integration/`), E2E separate at root for Playwright's config.
4. **`decimal.js`** is the exact-decimal layer, wrapped in `lib/money.ts` so no floating-point math touches money anywhere.
5. **`src/server/` is server-only** — imports the `server-only` package so bundling a server module into a client component fails at build time.
6. **Server-side org-membership checks in every action/RPC**, in addition to RLS; the service-role key is never exposed to the browser.
7. **Entry numbering** is a per-organization sequence table, locked with `FOR UPDATE` inside the posting transaction to prevent concurrent duplicates.

## 18. Instructions for the implementation AI

- Begin each phase by loading the relevant skills: `test-driven-development` (all code), `frontend-design` + `impeccable` (UI), `nodejs-backend-patterns` (backend), `webapp-testing` (UI testing), `verification-before-completion` (before marking anything done).
- Implement one phase at a time and keep the application runnable after each phase.
- Use strict TypeScript and exact decimal arithmetic.
- Centralize posting, reversal, and report calculations in tested domain services.
- Apply organization authorization through Supabase Row-Level Security and server-side membership checks for every query, mutation, and RPC operation.
- Never implement Posted-entry editing or deletion.
- Never calculate financial reports from cached UI totals.
- Never store mutable account balances.
- Never auto-post imported journal entries.
- Do not add BIR forms, tax filing, inventory, payroll, invoicing, OCR, or unrelated ERP features.
- Add tests with each accounting rule instead of postponing testing.
- Include clear error messages but do not expose stack traces or database details to the user.
- Use migrations for schema changes; do not manually alter the production database.
- Keep secrets out of the repository.
- Document assumptions and known limitations in the README.
