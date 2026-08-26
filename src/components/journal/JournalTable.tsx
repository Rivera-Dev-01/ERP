'use client';

import * as React from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import Link from 'next/link';
import { toast } from 'sonner';

import type { Tables } from '@/types/database';
import { formatEntryNumber } from '@/lib/validation/journal';
import { formatBusinessDate, formatPHP } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { AccountPicker, type AccountOption } from '@/components/journal/AccountPicker';
import { duplicateJournalEntry, postJournalEntry } from '@/server/actions/journal-actions';

export type JournalEntryRow = Tables<'journal_entry'> & { total: number };

const columnHelper = createColumnHelper<JournalEntryRow>();

function StatusBadge({ status }: { status: string }) {
  const variant =
    status === 'DRAFT' ? 'outline' : status === 'POSTED' ? 'secondary' : 'destructive';
  return <Badge variant={variant as 'outline' | 'secondary' | 'destructive'}>{status}</Badge>;
}

type Props = {
  data: JournalEntryRow[];
  accounts: AccountOption[];
  projectId?: string;
};

export function JournalTable({ data, accounts, projectId }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const q = searchParams.get('q') ?? '';
  const statusParam = searchParams.get('status') ?? '';
  const selectedStatuses = React.useMemo(
    () => statusParam.split(',').map((s) => s.trim()).filter(Boolean),
    [statusParam],
  );
  const fromParam = searchParams.get('from') ?? searchParams.get('date_from') ?? searchParams.get('start_date') ?? '';
  const toParam = searchParams.get('to') ?? searchParams.get('date_to') ?? searchParams.get('end_date') ?? '';
  const accountParam = searchParams.get('account') ?? searchParams.get('account_id') ?? '';

  const updateParam = React.useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      // Handle aliases: normalize to canonical keys: from, to, account, status, q
      const canonicalMap: Record<string, string> = {
        date_from: 'from',
        start_date: 'from',
        start: 'from',
        date_to: 'to',
        end_date: 'to',
        end: 'to',
        account_id: 'account',
        accountId: 'account',
      };
      const canonical = canonicalMap[key] ?? key;
      if (value === null || value === '') {
        params.delete(canonical);
        // also delete aliases
        for (const [alias, can] of Object.entries(canonicalMap)) {
          if (can === canonical) params.delete(alias);
        }
      } else {
        params.set(canonical, value);
      }
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname, router, searchParams],
  );

  const handleStatusToggle = React.useCallback(
    (val: string) => {
      if (!val) return;
      const next = selectedStatuses.includes(val)
        ? selectedStatuses.filter((s) => s !== val)
        : [...selectedStatuses, val];
      updateParam('status', next.length ? next.join(',') : null);
    },
    [selectedStatuses, updateParam],
  );

  const handleStatusSelect = React.useCallback(
    (val: string | null) => {
      if (val === 'ALL' || val === '' || val === null) {
        updateParam('status', null);
        return;
      }
      handleStatusToggle(val);
    },
    [handleStatusToggle, updateParam],
  );

  const handleDuplicate = React.useCallback(
    async (id: string) => {
      const res = await duplicateJournalEntry(id);
      if (!res.ok) {
        toast.error(res.formError ?? 'Unable to duplicate');
        return;
      }
      toast.success('Journal entry duplicated');
      if (res.newId) {
        router.push(projectId ? `/journal/${res.newId}?project=${projectId}` : `/journal/${res.newId}`);
      } else {
        router.refresh();
      }
    },
    [projectId, router],
  );

  const handlePost = React.useCallback(
    async (id: string) => {
      const res = await postJournalEntry(id);
      if (!res.ok) {
        const msg = res.formError ?? res.fieldErrors?.entry_date ?? 'Unable to post';
        toast.error(msg);
        return;
      }
      toast.success(res.entryNumber ? `Posted ${res.entryNumber}` : 'Entry posted');
      router.refresh();
    },
    [router],
  );

  const columns = React.useMemo(
    () => [
      columnHelper.accessor('entry_number', {
        header: 'Entry Number',
        cell: (info) => {
          const row = info.row.original;
          return formatEntryNumber(row.entry_number, row.entry_date);
        },
      }),
      columnHelper.accessor('entry_date', {
        header: 'Date',
        cell: (info) => {
          const v = info.getValue() as string;
          try {
            return formatBusinessDate(v);
          } catch {
            return v;
          }
        },
      }),
      columnHelper.accessor('reference', {
        header: 'Reference',
        cell: (info) => info.getValue() as string,
      }),
      columnHelper.accessor('description', {
        header: 'Description',
        cell: (info) => {
          const v = (info.getValue() as string) ?? '';
          return <span className="max-w-[260px] truncate block" title={v}>{v}</span>;
        },
      }),
      columnHelper.accessor('status', {
        header: 'Status',
        cell: (info) => <StatusBadge status={String(info.getValue())} />,
      }),
      columnHelper.accessor('total_debit', {
        header: 'Total',
        cell: (info) => {
          const row = info.row.original;
          const val = (row.total as unknown as number | undefined) ?? (row.total_debit as number);
          return formatPHP(val ?? 0);
        },
      }),
      columnHelper.accessor('updated_at', {
        header: 'Updated At',
        cell: (info) => {
          const v = info.getValue() as string;
          if (!v) return '—';
          try {
            const iso = v.slice(0, 10);
            return formatBusinessDate(iso);
          } catch {
            return v.slice(0, 10);
          }
        },
      }),
      columnHelper.display({
        id: 'actions',
        header: 'Actions',
        cell: (info) => {
          const row = info.row.original;
          const isDraft = row.status === 'DRAFT';
          const isPosted = row.status === 'POSTED';
          const detailHref = projectId ? `/journal/${row.id}?project=${projectId}` : `/journal/${row.id}`;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="ghost" size="sm">Actions</Button>}
              />
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => router.push(detailHref)}
                >
                  Open
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleDuplicate(row.id)}>
                  Duplicate Draft
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!isDraft}
                  onClick={() => {
                    if (isDraft) handlePost(row.id);
                  }}
                >
                  Post Draft
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    // Reverse is only meaningful for POSTED; navigate to detail where ReverseDialog lives
                    router.push(detailHref);
                  }}
                >
                  Reverse
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      }),
    ],
    [handleDuplicate, handlePost, projectId, router],
  );

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search reference or description…"
          defaultValue={q}
          onChange={(e) => {
            // debounce could be added; immediate for simplicity
            updateParam('q', e.target.value.trim() ? e.target.value : null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              updateParam('q', (e.target as HTMLInputElement).value.trim() || null);
            }
          }}
          aria-label="Search journal entries"
          className="max-w-sm"
        />

        {/* Status multi-select via Select */}
        <div className="flex items-center gap-1">
          <Select
            value=""
            onValueChange={handleStatusSelect}
          >
            <SelectTrigger className="w-[160px]" aria-label="Filter by status">
              <SelectValue placeholder={selectedStatuses.length ? selectedStatuses.join(', ') : 'All statuses'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All statuses</SelectItem>
              <SelectItem value="DRAFT">DRAFT</SelectItem>
              <SelectItem value="POSTED">POSTED</SelectItem>
              <SelectItem value="REVERSED">REVERSED</SelectItem>
            </SelectContent>
          </Select>
          {selectedStatuses.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {selectedStatuses.map((s) => (
                <Badge key={s} variant="secondary" className="gap-1">
                  {s}
                  <button
                    aria-label={`Remove ${s} filter`}
                    onClick={() => handleStatusToggle(s)}
                    className="ml-1 rounded-sm hover:bg-secondary-foreground/10 px-1"
                  >
                    ×
                  </button>
                </Badge>
              ))}
              <Button variant="ghost" size="sm" onClick={() => updateParam('status', null)}>
                Clear
              </Button>
            </div>
          )}
        </div>

        {/* Date range */}
        <Input
          type="date"
          value={fromParam}
          onChange={(e) => updateParam('from', e.target.value || null)}
          aria-label="From date"
          className="w-auto"
        />
        <Input
          type="date"
          value={toParam}
          onChange={(e) => updateParam('to', e.target.value || null)}
          aria-label="To date"
          className="w-auto"
        />

        {/* Account filter via AccountPicker on is_active accounts */}
        <div className="min-w-[220px]">
          <AccountPicker
            accounts={accounts}
            value={accountParam}
            onValueChange={(v) => updateParam('account', v || null)}
          />
          {accountParam && (
            <Button variant="ghost" size="sm" onClick={() => updateParam('account', null)} aria-label="Clear account filter">
              Clear account
            </Button>
          )}
        </div>

        <Link href={projectId ? `/journal/new?project=${projectId}` : '/journal/new'} className="ml-auto">
          <Button>New Journal Entry</Button>
        </Link>
      </div>

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
                  No journal entries yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
