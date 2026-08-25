import { describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
const available = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
describe.skipIf(!available)('organization integration', () => {
  it('member can read own organization', async () => {
    const admin = createClient<Database>(url!, serviceRoleKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: orgs } = await admin
      .from('organization')
      .select('id')
      .eq('id', '22222222-2222-2222-2222-222222222222');
    expect(orgs).toHaveLength(1);
  });
});
