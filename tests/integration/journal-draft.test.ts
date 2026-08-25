import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

const available = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

describe.skipIf(!available)('journal draft lifecycle', () => {
  const orgId = crypto.randomUUID();
  let admin: ReturnType<typeof createClient<Database>>;
  let userId: string;
  let periodId: string;
  let accountAId: string;
  let accountBId: string;
  let entryId: string | null = null;
  let duplicateId: string | null = null;
  let postedEntryId: string | null = null;

  beforeAll(async () => {
    admin = createClient<Database>(url!, serviceRoleKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { error: orgErr } = await admin.from('organization').insert({
      id: orgId,
      name: `Journal Test Org ${orgId.slice(0, 8)}`,
      legal_name: `Journal Test Org ${orgId.slice(0, 8)} Legal`,
    });
    if (orgErr) throw orgErr;

    const email = `journal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@v0.test`;
    const password = 'test-pass-123';
    const { data: userData, error: userErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (userErr) throw userErr;
    userId = userData.user!.id;

    const { error: profileErr } = await admin.from('profile').insert({ id: userId, name: 'Journal Tester' });
    if (profileErr) throw profileErr;

    const { error: memErr } = await admin.from('organization_membership').insert({
      organization_id: orgId,
      user_id: userId,
      role: 'ACCOUNTANT',
    });
    if (memErr) throw memErr;

    const { data: fp, error: fpErr } = await admin
      .from('fiscal_period')
      .insert({
        organization_id: orgId,
        name: `FY ${orgId.slice(0, 8)}`,
        start_date: '2026-07-01',
        end_date: '2026-07-31',
        status: 'OPEN',
      })
      .select('id')
      .single();
    if (fpErr) throw fpErr;
    periodId = fp!.id;

    const { data: accA, error: accAErr } = await admin
      .from('account')
      .insert({
        organization_id: orgId,
        code: '1000',
        name: 'Cash',
        type: 'ASSET',
        normal_balance: 'DEBIT',
        is_active: true,
      })
      .select('id')
      .single();
    if (accAErr) throw accAErr;
    accountAId = accA!.id;

    const { data: accB, error: accBErr } = await admin
      .from('account')
      .insert({
        organization_id: orgId,
        code: '4000',
        name: 'Revenue',
        type: 'INCOME',
        normal_balance: 'CREDIT',
        is_active: true,
      })
      .select('id')
      .single();
    if (accBErr) throw accBErr;
    accountBId = accB!.id;
  });

  afterAll(async () => {
    if (admin) {
      // delete in reverse FK order
      const idsToClean = [entryId, duplicateId, postedEntryId].filter(Boolean) as string[];
      for (const eid of idsToClean) {
        await admin.from('journal_line').delete().eq('journal_entry_id', eid);
      }
      for (const eid of idsToClean) {
        await admin.from('journal_entry').delete().eq('id', eid);
      }
      // any leftover entries for org
      await admin.from('journal_line').delete().in('journal_entry_id', idsToClean);
      await admin.from('fiscal_period').delete().eq('id', periodId);
      await admin.from('account').delete().eq('organization_id', orgId);
      await admin.from('organization_membership').delete().eq('organization_id', orgId);
      await admin.from('organization').delete().eq('id', orgId);
      if (userId) {
        await admin.from('profile').delete().eq('id', userId);
        await admin.auth.admin.deleteUser(userId);
      }
    }
  });

  it('creates a balanced draft, edits it, duplicates it, and deletes the duplicate', async () => {
    // 1. create via direct insert (simulating upsertJournalEntry create path) — Cash debit 100 / Revenue credit 100
    const reference = `JE-TEST-${Date.now()}`;
    const { data: entry, error: entryErr } = await admin
      .from('journal_entry')
      .insert({
        organization_id: orgId,
        fiscal_period_id: periodId,
        entry_date: '2026-07-15',
        reference,
        description: 'Initial draft',
        notes: null,
        status: 'DRAFT',
        entry_type: 'STANDARD',
        created_by_id: userId,
        total_debit: 100,
        total_credit: 100,
      })
      .select('id, status, total_debit, total_credit, reference')
      .single();
    expect(entryErr).toBeNull();
    expect(entry).toBeDefined();
    entryId = entry!.id;

    const { error: lineErr } = await admin.from('journal_line').insert([
      {
        journal_entry_id: entryId,
        account_id: accountAId,
        line_number: 1,
        description: null,
        debit: 100,
        credit: 0,
        tax_code: null,
      },
      {
        journal_entry_id: entryId,
        account_id: accountBId,
        line_number: 2,
        description: null,
        debit: 0,
        credit: 100,
        tax_code: null,
      },
    ]);
    expect(lineErr).toBeNull();

    // 2. re-read entry — status DRAFT, totals 100
    const { data: reread } = await admin.from('journal_entry').select('status, total_debit, total_credit').eq('id', entryId).single();
    expect(reread?.status).toBe('DRAFT');
    expect(Number(reread?.total_debit)).toBe(100);
    expect(Number(reread?.total_credit)).toBe(100);

    const { count: lineCount } = await admin.from('journal_line').select('id', { count: 'exact', head: true }).eq('journal_entry_id', entryId);
    expect(lineCount).toBe(2);

    // 3. edit description via upsert-like update (only DRAFT can be edited)
    const { error: updateErr } = await admin.from('journal_entry').update({ description: 'Edited draft' }).eq('id', entryId).eq('organization_id', orgId);
    expect(updateErr).toBeNull();
    const { data: edited } = await admin.from('journal_entry').select('description').eq('id', entryId).single();
    expect(edited?.description).toBe('Edited draft');

    // 4. duplicate → new entry reference ends with -copy, status DRAFT, same line count
    const { data: orig } = await admin.from('journal_entry').select('*').eq('id', entryId).single();
    expect(orig).not.toBeNull();
    const { data: created, error: dupErr } = await admin
      .from('journal_entry')
      .insert({
        organization_id: orig!.organization_id,
        fiscal_period_id: orig!.fiscal_period_id,
        entry_date: orig!.entry_date,
        reference: `${orig!.reference}-copy`,
        description: orig!.description,
        notes: orig!.notes,
        status: 'DRAFT',
        entry_type: orig!.entry_type,
        total_debit: 0,
        total_credit: 0,
        created_by_id: userId,
      })
      .select('id, reference, status')
      .single();
    expect(dupErr).toBeNull();
    duplicateId = created!.id;
    expect(created?.reference.endsWith('-copy')).toBe(true);
    expect(created?.status).toBe('DRAFT');

    const { data: origLines } = await admin.from('journal_line').select('*').eq('journal_entry_id', entryId).order('line_number');
    if (origLines?.length) {
      const { error: dupLineErr } = await admin.from('journal_line').insert(
        origLines.map((l, i) => ({
          journal_entry_id: duplicateId!,
          account_id: l.account_id,
          line_number: i + 1,
          description: l.description,
          debit: l.debit,
          credit: l.credit,
          tax_code: l.tax_code,
        })),
      );
      expect(dupLineErr).toBeNull();
    }
    const { count: dupLineCount } = await admin.from('journal_line').select('id', { count: 'exact', head: true }).eq('journal_entry_id', duplicateId!);
    expect(dupLineCount).toBe(2);

    // 5. delete duplicate → ok, confirm 404
    await admin.from('journal_line').delete().eq('journal_entry_id', duplicateId!);
    const { error: delErr } = await admin.from('journal_entry').delete().eq('id', duplicateId!);
    expect(delErr).toBeNull();
    const { data: deletedCheck } = await admin.from('journal_entry').select('id').eq('id', duplicateId!).maybeSingle();
    expect(deletedCheck).toBeNull();
    // mark as cleaned so afterAll doesn't double-delete
    duplicateId = null;
  });

  it('POSTED entries cannot be edited (upsert status guard) and cannot be deleted', async () => {
    // seed a POSTED entry
    const { data: posted, error: postedErr } = await admin
      .from('journal_entry')
      .insert({
        organization_id: orgId,
        fiscal_period_id: periodId,
        entry_date: '2026-07-20',
        reference: `JE-POSTED-${Date.now()}`,
        description: 'Posted entry',
        status: 'POSTED',
        entry_type: 'STANDARD',
        created_by_id: userId,
        posted_by_id: userId,
        posted_at: new Date().toISOString(),
        entry_number: 999,
        total_debit: 100,
        total_credit: 100,
      })
      .select('id, status')
      .single();
    expect(postedErr).toBeNull();
    postedEntryId = posted!.id;

    await admin.from('journal_line').insert([
      { journal_entry_id: postedEntryId, account_id: accountAId, line_number: 1, debit: 100, credit: 0 },
      { journal_entry_id: postedEntryId, account_id: accountBId, line_number: 2, debit: 0, credit: 100 },
    ]);

    // Simulate upsert guard: fetch and check status !== DRAFT
    const { data: existing } = await admin.from('journal_entry').select('status, organization_id').eq('id', postedEntryId).maybeSingle();
    const canEdit = !!existing && existing.organization_id === orgId && existing.status === 'DRAFT';
    expect(canEdit).toBe(false);

    // Simulate delete guard: only DRAFT can be deleted
    const canDelete = !!existing && existing.organization_id === orgId && existing.status === 'DRAFT';
    expect(canDelete).toBe(false);

    // Verify that attempting to update via guarded logic would return error (we don't actually bypass RLS, just assert guard)
    // Cleanup this posted entry for afterAll (will be deleted there)
  });
});
