-- 00025 cash flow — per-account indirect classification
alter table public.account add column if not exists cf_category text not null default 'OPERATING' check (cf_category in ('OPERATING','INVESTING','FINANCING'));

-- Backfill smart defaults (idempotent)
update public.account set cf_category = 'OPERATING' where is_cash = true or type in ('INCOME','EXPENSE');
update public.account set cf_category = 'INVESTING' where type = 'ASSET' and is_cash = false;
update public.account set cf_category = 'FINANCING' where type in ('LIABILITY','EQUITY');
-- Working-capital assets belong to OPERATING (indirect method): receivables/prepaid/inventory by name heuristic
update public.account set cf_category = 'OPERATING'
 where type='ASSET' and is_cash=false
   and (code like '11%' or lower(name) ~ '(receivable|prepaid|inventory)');

-- One-time hygiene: legacy rows predate is_cash — flag obvious cash accounts
update public.account set is_cash = true
 where is_cash = false and type='ASSET' and lower(name) like 'cash%';

create index if not exists idx_account_company_cf on public.account (company_id, cf_category);
