import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { isOverlapError } from '@/server/domain/fiscal-periods';

const available = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

describe.skipIf(!available)('fiscal_period integration', () => {
  const orgId = crypto.randomUUID();
  let admin: ReturnType<typeof createClient<Database>>;
  let periodId: string | null = null;

  beforeAll(async () => {
    admin = createClient<Database>(url!, serviceRoleKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await admin.from('organization').insert({
      id: orgId,
      name: `Test Org ${orgId.slice(0, 8)}`,
      legal_name: `Test Org ${orgId.slice(0, 8)} Legal`,
    });
    if (error) throw error;
  });

  afterAll(async () => {
    if (admin) {
      await admin.from('fiscal_period').delete().eq('organization_id', orgId);
      await admin.from('organization').delete().eq('id', orgId);
    }
  });

  it('creates Aug 2026 period successfully', async () => {
    const { data, error } = await admin
      .from('fiscal_period')
      .insert({
        organization_id: orgId,
        name: 'Aug 2026',
        start_date: '2026-08-01',
        end_date: '2026-08-31',
        status: 'OPEN',
      })
      .select('id')
      .single();
    expect(error).toBeNull();
    expect(data?.id).toBeDefined();
    periodId = data!.id;
  });

  it('rejects overlapping period (Aug15-Sep15)', async () => {
    const { error } = await admin.from('fiscal_period').insert({
      organization_id: orgId,
      name: 'Aug 15-Sep 15 Overlap',
      start_date: '2026-08-15',
      end_date: '2026-09-15',
      status: 'OPEN',
    });
    expect(error).not.toBeNull();
    expect(isOverlapError(error as { code?: string; message?: string })).toBe(true);
  });

  it('closes OPEN period sets CLOSED and closed_at', async () => {
    expect(periodId).not.toBeNull();
    const { error } = await admin
      .from('fiscal_period')
      .update({ status: 'CLOSED', closed_at: new Date().toISOString() })
      .eq('id', periodId!)
      .eq('organization_id', orgId)
      .eq('status', 'OPEN');
    expect(error).toBeNull();
    const { data } = await admin
      .from('fiscal_period')
      .select('status, closed_at')
      .eq('id', periodId!)
      .single();
    expect(data?.status).toBe('CLOSED');
    expect(data?.closed_at).not.toBeNull();
  });
});
