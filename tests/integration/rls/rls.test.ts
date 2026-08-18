import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const available = Boolean(url && serviceRoleKey && anonKey);

describe.skipIf(!available)('RLS cross-organization isolation', () => {
  const emailA = `rls-a-${Date.now()}@v0.test`;
  const emailB = `rls-b-${Date.now()}@v0.test`;
  const password = 'test-pass-123';

  let admin: SupabaseClient<Database>;
  let userIdA = '';
  let userIdB = '';
  let orgIdA = '';
  let orgIdB = '';

  beforeAll(async () => {
    admin = createClient<Database>(url!, serviceRoleKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userA } = await admin.auth.admin.createUser({
      email: emailA,
      password,
      email_confirm: true,
    });
    const { data: userB } = await admin.auth.admin.createUser({
      email: emailB,
      password,
      email_confirm: true,
    });
    if (!userA?.user || !userB?.user) {
      throw new Error('Failed to create RLS test users');
    }
    userIdA = userA.user.id;
    userIdB = userB.user.id;

    await admin.from('profile').insert([
      { id: userIdA, name: 'RLS User A' },
      { id: userIdB, name: 'RLS User B' },
    ]);

    const { data: orgA } = await admin
      .from('organization')
      .insert({ name: 'Org A', legal_name: 'Org A' })
      .select('id')
      .single();
    const { data: orgB } = await admin
      .from('organization')
      .insert({ name: 'Org B', legal_name: 'Org B' })
      .select('id')
      .single();
    orgIdA = orgA!.id;
    orgIdB = orgB!.id;

    await admin.from('organization_membership').insert([
      { organization_id: orgIdA, user_id: userIdA, role: 'ACCOUNTANT' },
      { organization_id: orgIdB, user_id: userIdB, role: 'ACCOUNTANT' },
    ]);

    await admin.from('account').insert([
      {
        organization_id: orgIdA,
        code: '1000',
        name: 'Org A Cash',
        type: 'ASSET',
        normal_balance: 'DEBIT',
      },
      {
        organization_id: orgIdB,
        code: '1000',
        name: 'Org B Cash',
        type: 'ASSET',
        normal_balance: 'DEBIT',
      },
    ]);
  });

  afterAll(async () => {
    if (!available) return;
    await admin.from('account').delete().in('organization_id', [orgIdA, orgIdB]);
    await admin.from('organization_membership').delete().in('organization_id', [orgIdA, orgIdB]);
    await admin.from('organization').delete().in('id', [orgIdA, orgIdB]);
    await admin.auth.admin.deleteUser(userIdA);
    await admin.auth.admin.deleteUser(userIdB);
  });

  async function signInAs(email: string) {
    const client = createClient<Database>(url!, anonKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await client.auth.signInWithPassword({ email, password });
    expect(error).toBeNull();
    return client;
  }

  it('lets a member read only their own organization records', async () => {
    const client = await signInAs(emailA);

    const { data: accounts } = await client.from('account').select('id, code, name');
    expect(accounts).toEqual([expect.objectContaining({ code: '1000', name: 'Org A Cash' })]);

    const { data: orgs } = await client.from('organization').select('id');
    expect(orgs).toEqual([expect.objectContaining({ id: orgIdA })]);
  });

  it('denies reading another organization record by id', async () => {
    const client = await signInAs(emailA);

    const { data: crossOrg } = await client
      .from('account')
      .select('*')
      .in('organization_id', [orgIdB]);
    expect(crossOrg).toEqual([]);
  });

  it('denies inserting into another organization', async () => {
    const client = await signInAs(emailA);

    const { error } = await client.from('account').insert({
      organization_id: orgIdB,
      code: '9999',
      name: 'Sneaky Account',
      type: 'ASSET',
      normal_balance: 'DEBIT',
    });

    expect(error).not.toBeNull();
    const { data: check } = await admin
      .from('account')
      .select('id')
      .eq('organization_id', orgIdB)
      .eq('code', '9999');
    expect(check).toEqual([]);
  });

  it('denies updating another organization record', async () => {
    const client = await signInAs(emailA);

    const { error } = await client
      .from('account')
      .update({ name: 'Hacked' })
      .eq('organization_id', orgIdB);
    expect(error).toBeNull();

    const { data: check } = await admin
      .from('account')
      .select('name')
      .eq('organization_id', orgIdB)
      .eq('code', '1000')
      .single();
    expect(check!.name).toBe('Org B Cash');
  });

  it('restricts profile access to the owner', async () => {
    const client = await signInAs(emailA);

    const { data: own } = await client.from('profile').select('id').eq('id', userIdA);
    expect(own).toEqual([expect.objectContaining({ id: userIdA })]);

    const { data: other } = await client.from('profile').select('id').eq('id', userIdB);
    expect(other).toEqual([]);
  });
});
