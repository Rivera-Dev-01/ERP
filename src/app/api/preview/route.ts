import { NextRequest, NextResponse } from 'next/server';
import { parseTabular, ImportParseError } from '@/server/imports/parser';

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get('file') as File | null;
  if (!file) return NextResponse.json({ ok: false, error: 'No file' }, { status: 400 });
  try {
    const buf = await file.arrayBuffer();
    const parsed = await parseTabular(file.name, buf);
    const previewRows = parsed.rows.slice(0, 5);
    // For journal preview, compute totals if debit/credit headers present
    let totalDebit: string | null = null;
    let totalCredit: string | null = null;
    const debitHeader = parsed.headers.find((h) => h.toLowerCase() === 'debit');
    const creditHeader = parsed.headers.find((h) => h.toLowerCase() === 'credit');
    if (debitHeader || creditHeader) {
      let d = 0, c = 0;
      for (const r of previewRows) {
        d += Number.parseFloat(r[debitHeader ?? 'Debit'] ?? r['Debit'] ?? '0') || 0;
        c += Number.parseFloat(r[creditHeader ?? 'Credit'] ?? r['Credit'] ?? '0') || 0;
      }
      totalDebit = String(d);
      totalCredit = String(c);
    }
    return NextResponse.json({ ok: true, headers: parsed.headers, rows: previewRows, rowCount: parsed.rows.length, totalDebit, totalCredit });
  } catch (e) {
    if (e instanceof ImportParseError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: String((e as Error).message ?? 'Parse failed') }, { status: 400 });
  }
}
