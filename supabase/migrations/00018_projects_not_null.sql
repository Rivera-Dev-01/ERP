-- Make project_id NOT NULL after app code threads ?project= (fallback to first ACTIVE)
-- Ensure no orphan rows before constraint (should be none after backfill + fallback)
do $$ begin
  -- account already not null via 00015 + 00016 drop then strict; re-add
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='account' and column_name='project_id' and is_nullable='YES') then
    alter table public.account alter column project_id set not null;
  end if;
end $$;
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='fiscal_period' and column_name='project_id' and is_nullable='YES') then
    alter table public.fiscal_period alter column project_id set not null;
  end if;
end $$;
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='journal_entry' and column_name='project_id' and is_nullable='YES') then
    alter table public.journal_entry alter column project_id set not null;
  end if;
end $$;
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='import_batch' and column_name='project_id' and is_nullable='YES') then
    alter table public.import_batch alter column project_id set not null;
  end if;
end $$;
