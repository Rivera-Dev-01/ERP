'use client';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import type { Tables } from '@/types/database';
import { formatBusinessDate } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CloseConfirm } from '@/components/periods/CloseConfirm';
import { ReopenDialog } from '@/components/periods/ReopenDialog';

type Period = Tables<'fiscal_period'>;

const columnHelper = createColumnHelper<Period>();

export function PeriodTable({ data, checks }: { data: Period[]; checks?: Record<string, { draftCount: number; tbBalanced: boolean | null; companyId: string; start: string; end: string; name: string }> }) {
  const columns = [
    columnHelper.accessor('name', {
      header: 'Name',
      cell: (info) => info.getValue(),
    }),
    columnHelper.accessor('start_date', {
      header: 'Start',
      cell: (info) => formatBusinessDate(info.getValue()),
    }),
    columnHelper.accessor('end_date', {
      header: 'End',
      cell: (info) => formatBusinessDate(info.getValue()),
    }),
    columnHelper.accessor('status', {
      header: 'Status',
      cell: (info) => {
        const v = info.getValue() as string;
        const row = info.row.original as Period & { reopened_at?: string | null; reopened_reason?: string | null };
        return (
          <span className="inline-flex items-center gap-1">
            <Badge variant={v === 'OPEN' ? 'secondary' : 'outline'}>{v}</Badge>
            {v === 'OPEN' && row.reopened_at ? (
              <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800" title={row.reopened_reason ?? 'Reopened'}>
                Reopened
              </Badge>
            ) : null}
          </span>
        );
      },
    }),
    columnHelper.accessor('closed_at', {
      header: 'Closed At',
      cell: (info) => {
        const v = info.getValue();
        return v ? new Date(v).toLocaleString('en-PH', { timeZone: 'Asia/Manila' }) : '—';
      },
    }),
    columnHelper.display({
      id: 'actions',
      header: 'Actions',
      cell: (info) => {
        const row = info.row.original;
        if (row.status === 'OPEN') {
          const ch = checks?.[row.id];
          return <CloseConfirm id={row.id} name={row.name} checks={ch ? { draftCount: ch.draftCount, tbBalanced: ch.tbBalanced, companyId: ch.companyId, start: ch.start, end: ch.end } : undefined} />;
        }
        if (row.status === 'CLOSED') return <ReopenDialog id={row.id} name={row.name} />;
        return null;
      },
    }),
  ];

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id}>
              {hg.headers.map((h) => (
                <TableHead key={h.id}>
                  {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                No periods yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
