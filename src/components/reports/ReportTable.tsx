'use client';

import Link from 'next/link';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export function ReportTable<T>({
  data,
  columns,
  linkKeys,
}: {
  data: T[];
  columns: ColumnDef<T, unknown>[];
  /** Data-driven drill-down: render value of these accessorKeys as Link to row._href (no function props cross RSC boundary) */
  linkKeys?: string[];
}) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const headerGroups = table.getHeaderGroups();
  const rows = table.getRowModel().rows;
  const colSpan = columns.length || 1;

  const renderCell = (rowId: string, colId: string, original: unknown) => {
    if (linkKeys?.includes(colId)) {
      const rec = original as Record<string, unknown>;
      const href = typeof rec._href === 'string' ? rec._href : null;
      const value = rec[colId];
      if (href && value != null && String(value) !== '—') {
        return (
          <Link href={href} className="underline text-primary">
            {String(value)}
          </Link>
        );
      }
      return value == null ? '' : String(value);
    }
    return undefined;
  };

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          {headerGroups.map((hg) => (
            <TableRow key={hg.id}>
              {hg.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {rows.length ? (
            rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => {
                  const colId = cell.column.columnDef.id ?? (cell.column.columnDef as unknown as { accessorKey?: string }).accessorKey ?? cell.column.id;
                  const custom = renderCell(row.id, colId, row.original);
                  return <TableCell key={cell.id}>{custom !== undefined ? custom : flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>;
                })}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={colSpan} className="h-24 text-center text-muted-foreground">
                No entries
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
