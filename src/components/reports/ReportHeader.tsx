import { formatBusinessDate } from '@/lib/format';

export function ReportHeader({
  company,
  title,
  from,
  to,
  generatedAt,
  filters,
}: {
  company: string;
  title: string;
  from: string;
  to: string;
  generatedAt: string;
  filters?: string;
}) {
  return (
    <div className="space-y-2 border-b pb-4" data-report-header>
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-sm text-muted-foreground">{company}</p>
      <p className="text-sm text-muted-foreground">
        Period: {from ? formatBusinessDate(from) : '—'} – {to ? formatBusinessDate(to) : '—'}
      </p>
      <p className="text-xs text-muted-foreground">
        Generated{' '}
        {new Date(generatedAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}
        {filters ? ` · Filters: ${filters}` : ''}
      </p>
    </div>
  );
}
