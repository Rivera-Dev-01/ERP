'use server';
import 'server-only';
import { revalidatePath } from 'next/cache';
import Papa from 'papaparse';
import { requireOrganizationAction } from '@/server/auth';
import { createClient } from '@/server/supabase/server';
import { validateJournalGroups, parseJournalHeader } from '@/server/imports/journal-import';
import { toDbString } from '@/lib/money';

type JournalImportResult = {
  ok: boolean;
  rowErrors?: Array<{ row: number; group: string; message: string }>;
  rowCount?: number;
  validGroupCount?: number;
  formError?: string;
};

export async function importJournalCsv(_prev: JournalImportResult, formData: FormData): Promise<JournalImportResult> {
  let ctx;
  try {
    ctx = await requireOrganizationAction();
  } catch {
    return { ok: false, formError: 'Not authorized' };
  }
  const file = formData.get('file') as File | null;
  if (!file) return { ok: false, formError: 'No file provided' };
  let projectId = String(formData.get('project_id') ?? '').trim();
  const supabase = await createClient();
  if (!projectId) {
    const { data: proj } = await supabase
      .from('project')
      .select('id')
      .eq('organization_id', ctx.organization.id)
      .eq('status', 'ACTIVE')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!proj) return { ok: false, formError: 'No project found. Create a project first.' };
    projectId = proj.id;
  }

  const text = await file.text();
  const parsed = (
    Papa.parse as unknown as (
      input: string,
      config: unknown,
    ) => Papa.ParseResult<Record<string, string>>
  )(text, {
    header: true,
    skipEmptyLines: true,
    trimHeaders: true,
  } as unknown as Papa.ParseConfig);
  const headers = (parsed.meta.fields ?? []).map((h: string) => String(h).trim());
  const headerCheck = parseJournalHeader(headers);
  if (!headerCheck.ok) return { ok: false, formError: headerCheck.message };

  const rows = parsed.data as Record<string, string>[];

  // Build accountMap for this project
  const { data: accounts } = await supabase
    .from('account')
    .select('id,code,is_active')
    .eq('organization_id', ctx.organization.id)
    .eq('project_id', projectId);
  const accountMap = new Map<string, { id: string; is_active: boolean }>();
  for (const a of accounts ?? []) {
    accountMap.set(a.code, { id: a.id, is_active: a.is_active });
  }

  const { rowErrors, normalized } = validateJournalGroups(rows, { accountMap });

  // Period check per group: entry_date must be in OPEN period for this project
  for (const g of normalized) {
    // Skip if already has rowErrors for this group
    const hasGroupError = rowErrors.some((e) => e.group === g.group);
    if (hasGroupError) continue;
    const { data: period } = await supabase
      .from('fiscal_period')
      .select('id')
      .eq('organization_id', ctx.organization.id)
      .eq('project_id', projectId)
      .eq('status', 'OPEN')
      .lte('start_date', g.entry_date)
      .gte('end_date', g.entry_date)
      .maybeSingle();
    if (!period) {
      rowErrors.push({ row: g.lines[0]?.row ?? -1, group: g.group, message: `Entry Date ${g.entry_date} not in any open period for this project` });
    }
  }

  if (rowErrors.length > 0) return { ok: false, rowErrors, rowCount: rows.length };

  // Create Draft entries per group
  for (const g of normalized) {
    const { data: period } = await supabase
      .from('fiscal_period')
      .select('id')
      .eq('organization_id', ctx.organization.id)
      .eq('project_id', projectId)
      .eq('status', 'OPEN')
      .lte('start_date', g.entry_date)
      .gte('end_date', g.entry_date)
      .maybeSingle();
    if (!period) continue; // already errored

    const totalDebit = g.lines.reduce((s, l) => s + Number(l.debit || '0'), 0);
    const totalCredit = g.lines.reduce((s, l) => s + Number(l.credit || '0'), 0);

    const { data: entry, error: entryErr } = await supabase
      .from('journal_entry')
      .insert({
        organization_id: ctx.organization.id,
        project_id: projectId,
        fiscal_period_id: period.id,
        entry_date: g.entry_date,
        reference: g.reference,
        description: g.description,
        status: 'DRAFT',
        entry_type: 'STANDARD',
        total_debit: Number.parseFloat(toDbString(String(totalDebit))),
        total_credit: Number.parseFloat(toDbString(String(totalCredit))),
        created_by_id: ctx.profile.id,
      })
      .select('id')
      .single();
    if (entryErr || !entry) {
      return { ok: false, formError: 'Failed to create journal entries. Please try again.' };
    }
    const linePayload = g.lines.map((l, idx) => ({
      journal_entry_id: entry.id,
      account_id: accountMap.get(l.account_code)!.id,
      line_number: idx + 1,
      description: l.description || null,
      debit: Number.parseFloat(toDbString(l.debit || '0')),
      credit: Number.parseFloat(toDbString(l.credit || '0')),
      tax_code: l.tax_code || null,
    }));
    const { error: lineErr } = await supabase.from('journal_line').insert(linePayload);
    if (lineErr) {
      return { ok: false, formError: 'Failed to create journal lines.' };
    }
  }

  await supabase.from('import_batch').insert({
    organization_id: ctx.organization.id,
    project_id: projectId,
    file_name: file.name,
    import_type: 'JOURNAL_ENTRIES',
    status: 'IMPORTED',
    row_count: rows.length,
    valid_row_count: rows.length,
    invalid_row_count: 0,
    created_by_id: ctx.profile.id,
  });

  revalidatePath('/journal');
  revalidatePath('/imports');
  return { ok: true, rowCount: rows.length, validGroupCount: normalized.length };
}
