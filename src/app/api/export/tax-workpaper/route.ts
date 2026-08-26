import { NextRequest, NextResponse } from 'next/server';
import { requireOrganization } from '@/server/auth';
import { createClient } from '@/server/supabase/server';

export async function GET(req: NextRequest) {
  let ctx;
  try {
    ctx = await requireOrganization();
  } catch {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
  }
  const url = new URL(req.url);
  const companyParam = url.searchParams.get('company') ?? url.searchParams.get('project');
  let companyId = companyParam ?? undefined;
  if (!companyId) {
    const supabase = await createClient();
    const { data: comp } = await supabase.from('company').select('id').eq('organization_id', ctx.organization.id).eq('status', 'ACTIVE').order('created_at', { ascending: true }).limit(1).maybeSingle();
    companyId = comp?.id ?? undefined;
  }
  if (!companyId) return NextResponse.json({ error: 'No company' }, { status: 400 });
  const year = url.searchParams.get('year') ?? String(new Date().getFullYear());
  const supabase = await createClient();
  const { data: statuses } = await supabase.from('filing_status').select('form,period_label,due_date,status').eq('company_id', companyId).gte('due_date', `${year}-01-01`).lte('due_date', `${year}-12-31`).order('due_date');
  const headers = ['Form', 'Period', 'Due Date', 'Status'];
  const rows = (statuses ?? []).map((s) => ({
    Form: (s as unknown as { form: string }).form,
    Period: (s as unknown as { period_label: string }).period_label,
    'Due Date': (s as unknown as { due_date: string }).due_date,
    Status: (s as unknown as { status: string }).status,
  }));
  const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => `"${String((r as Record<string, unknown>)[h] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="tax-workpaper-${year}.csv"`,
    },
  });
}
