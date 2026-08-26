-- 00021_performance_indexes: hot-path per-Project queries (dashboard, journal, reports) were seq scans
-- Adds composite indexes for the exact filters used in balances.ts / journal/page.tsx / dashboard
-- All IF NOT EXISTS to stay idempotent; FK indexes already exist but composites speed up (org,project,status,date)

-- journal_entry: per-Project list + status/date filters + org scoping
create index if not exists idx_journal_entry_org_project_status_date on journal_entry (organization_id, project_id, status, entry_date desc);
create index if not exists idx_journal_entry_project_id on journal_entry (project_id);
create index if not exists idx_journal_entry_org_project on journal_entry (organization_id, project_id);

-- journal_line: balances.ts does journal_line -> journal_entry!inner(status,org,project,date) + account_id filtering
create index if not exists idx_journal_line_account_id on journal_line (account_id);
create index if not exists idx_journal_line_journal_entry_id on journal_line (journal_entry_id);

-- account: per-Project code lookup + active filter (journal/new, accounts, reports FilterBar)
create index if not exists idx_account_org_project_active_code on account (organization_id, project_id, is_active, code);
create index if not exists idx_account_project_id on account (project_id);

-- fiscal_period: per-Project OPEN period lookup (reports + dashboard)
create index if not exists idx_fiscal_period_org_project_status_start on fiscal_period (organization_id, project_id, status, start_date desc);
create index if not exists idx_fiscal_period_project_id on fiscal_period (project_id);

-- project: layout + every page fetches ACTIVE per org
create index if not exists idx_project_org_status_created on project (organization_id, status, created_at);
