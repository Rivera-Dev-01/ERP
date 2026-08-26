-- Drop old per-organization period exclusion (kept after 00015), keep per-project
alter table public.fiscal_period drop constraint if exists fiscal_period_organization_id_daterange_excl;
alter table public.fiscal_period drop constraint if exists fiscal_period_organization_id_excl;
alter table public.fiscal_period drop constraint if exists fiscal_period_no_overlap;
