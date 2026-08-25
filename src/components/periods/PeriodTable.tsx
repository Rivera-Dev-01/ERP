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

type Period = Tables<'fiscal_period'>;

const columnHelper = createColumnHelper<Period>();

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
      const v = info.getValue();
      return <Badge variant={v === 'OPEN' ? 'secondary' : 'outline'}>{v}</Badge>;
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
      if (row.status !== 'OPEN') return null;
      return <CloseConfirm id={row.id} name={row.name} />;
    },
  }),
];

export function PeriodTable({ data }: { data: Period[] }) {
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
