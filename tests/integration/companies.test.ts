import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

const available = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

describe.skipIf(!available)('companies isolation', () => {
  const orgId = crypto.randomUUID();
  let admin: ReturnType<typeof createClient<Database>>;
  let userId: string;
  let companyAId: string;
  let companyBId: string;

  beforeAll(async () => {
    admin = createClient<Database>(url!, serviceRoleKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { error: orgErr } = await admin.from('organization').insert({
      id: orgId,
      name: `Comp Org ${orgId.slice(0, 8)}`,
      legal_name: `Comp Org ${orgId.slice(0, 8)} Legal`,
    });
    if (orgErr) throw orgErr;

    const email = `comp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@v0.test`;
    const password = 'test-pass-123';
    const { data: userData, error: userErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (userErr) throw userErr;
    userId = userData.user!.id;

    const { error: profileErr } = await admin.from('profile').insert({ id: userId, name: 'Comp Tester' });
    if (profileErr) throw profileErr;

    const { error: memErr } = await admin.from('organization_membership').insert({
      organization_id: orgId,
      user_id: userId,
      role: 'ACCOUNTANT',
    });
    if (memErr) throw memErr;

    const { data: compA, error: compAErr } = await admin
      .from('company')
      .insert({ organization_id: orgId, name: 'Example Client', client_name: 'Example' })
      .select('id')
      .single();
    if (compAErr) throw compAErr;
    companyAId = compA!.id;

    const { data: compB, error: compBErr } = await admin
      .from('company')
      .insert({ organization_id: orgId, name: 'My Company', client_name: 'Mine' })
      .select('id')
      .single();
    if (compBErr) throw compBErr;
    companyBId = compB!.id;
  });

  afterAll(async () => {
    if (admin) {
      // Clean company-scoped data first
      await admin.from('account').delete().eq('company_id', companyAId);
      await admin.from('account').delete().eq('company_id', companyBId);
      await admin.from('fiscal_period').delete().eq('company_id', companyAId);
      await admin.from('fiscal_period').delete().eq('company_id', companyBId);
      await admin.from('company').delete().eq('id', companyBId);
      await admin.from('company').delete().eq('id', companyAId);
      await admin.from('organization_membership').delete().eq('organization_id', orgId);
      await admin.from('organization').delete().eq('id', orgId);
      if (userId) {
        await admin.from('profile').delete().eq('id', userId);
        await admin.auth.admin.deleteUser(userId);
      }
    }
  });

  it('code unique per company, not org', async () => {
    const { error: errA } = await admin.from('account').insert({
      organization_id: orgId,
      company_id: companyAId,
      code: '1000',
      name: 'Cash A',
      type: 'ASSET',
      normal_balance: 'DEBIT',
      is_active: true,
    });
    expect(errA).toBeNull();

    const { error: errB } = await admin.from('account').insert({
      organization_id: orgId,
      company_id: companyBId,
      code: '1000',
      name: 'Cash B',
      type: 'ASSET',
      normal_balance: 'DEBIT',
      is_active: true,
    });
    expect(errB).toBeNull(); // same code in different company ok

    const { error: dupErr } = await admin.from('account').insert({
      organization_id: orgId,
      company_id: companyAId,
      code: '1000',
      name: 'Cash A2',
      type: 'ASSET',
      normal_balance: 'DEBIT',
      is_active: true,
    });
    expect(dupErr).not.toBeNull();
    expect(dupErr?.code).toBe('23505');
  });

  it('period overlap per company only', async () => {
    const { error: pA } = await admin.from('fiscal_period').insert({
      organization_id: orgId,
      company_id: companyAId,
      name: 'July 2026 A',
      start_date: '2026-07-01',
      end_date: '2026-07-31',
      status: 'OPEN',
    });
    expect(pA).toBeNull();

    const { error: pB } = await admin.from('fiscal_period').insert({
      organization_id: orgId,
      company_id: companyBId,
      name: 'July 2026 B',
      start_date: '2026-07-01',
      end_date: '2026-07-31',
      status: 'OPEN',
    });
    expect(pB).toBeNull(); // same daterange in different company ok

    const { error: overlap } = await admin.from('fiscal_period').insert({
      organization_id: orgId,
      company_id: companyAId,
      name: 'July Overlap A',
      start_date: '2026-07-15',
      end_date: '2026-08-15',
      status: 'OPEN',
    });
    expect(overlap).not.toBeNull();
  });
});
