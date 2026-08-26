-- 00023 company profile editable fields + is_cash

-- organization: make tax fields editable + add branch_code/address
alter table public.organization add column if not exists branch_code text check (branch_code is null or char_length(branch_code) between 1 and 20);
alter table public.organization add column if not exists address text check (address is null or char_length(address) between 1 and 500);

-- account is_cash flag for dashboard cash widget
alter table public.account add column if not exists is_cash boolean not null default false;
create index if not exists idx_account_company_is_cash on public.account (company_id, is_cash) where is_cash = true;

-- optional: ensure tax_classification allows the three values (existing column is text)
-- add check constraint if not exists
do $$ begin
  alter table public.organization add constraint organization_tax_classification_check
    check (tax_classification is null or tax_classification in ('VAT','NON_VAT','PERCENTAGE'));
exception when duplicate_object then null; end $$;
