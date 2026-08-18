-- Demo accountant (Supabase Auth user). Password: demo-pass-123
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change,
  email_change_token_new, email_change_token_current
) values (
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-1111-1111-111111111111',
  'authenticated', 'authenticated',
  'accountant@v0.local',
  crypt('demo-pass-123', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(), now(),
  '', '', '', '', ''
) on conflict (id) do nothing;

insert into auth.identities (
  provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
) values (
  '11111111-1111-1111-1111-111111111111',
  '11111111-1111-1111-1111-111111111111',
  '{"sub":"11111111-1111-1111-1111-111111111111","email":"accountant@v0.local"}',
  'email', now(), now(), now()
) on conflict (provider_id, provider) do nothing;

insert into public.profile (id, name) values ('11111111-1111-1111-1111-111111111111', 'Demo Accountant')
on conflict (id) do nothing;

insert into public.organization (id, name, legal_name, currency_code, timezone, fiscal_year_start_month)
values ('22222222-2222-2222-2222-222222222222', 'V0 Accounting Demo', 'V0 Accounting Demo', 'PHP', 'Asia/Manila', 1)
on conflict (id) do nothing;

insert into public.organization_membership (organization_id, user_id, role)
values ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'ACCOUNTANT')
on conflict (organization_id, user_id) do nothing;

insert into public.fiscal_period (organization_id, name, start_date, end_date, status)
values ('22222222-2222-2222-2222-222222222222', 'July 2026 Test Period', '2026-07-01', '2026-07-31', 'OPEN')
on conflict (organization_id, name) do nothing;
