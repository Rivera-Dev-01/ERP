'use client';

import { useCallback } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type AccountOption = { id: string; code: string; name: string };

export function FilterBar({
  from,
  to,
  accounts,
}: {
  from: string;
  to: string;
  accounts: AccountOption[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const updateParams = useCallback(
    (updates: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === undefined || value === '') {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [router, pathname, searchParams],
  );

  const selectedAccount: string | undefined = searchParams.get('account') ?? undefined;
  const status: string = searchParams.get('status') ?? 'POSTED';
  const qParam: string | undefined = searchParams.get('q') ?? undefined;

  return (
    <div data-filter-bar className="flex flex-wrap items-end gap-3 py-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="report-from" className="text-xs font-medium text-muted-foreground">
          From
        </label>
        <Input
          id="report-from"
          type="date"
          defaultValue={from}
          onChange={(e) => updateParams({ from: e.target.value || undefined })}
          className="w-[160px]"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="report-to" className="text-xs font-medium text-muted-foreground">
          To
        </label>
        <Input
          id="report-to"
          type="date"
          defaultValue={to}
          onChange={(e) => updateParams({ to: e.target.value || undefined })}
          className="w-[160px]"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="report-account" className="text-xs font-medium text-muted-foreground">
          Account
        </label>
        <Select
          value={selectedAccount ?? '__all__'}
          onValueChange={(v) => updateParams({ account: v === '__all__' || v == null ? undefined : v })}
        >
          <SelectTrigger id="report-account" className="w-[220px]">
            <SelectValue placeholder="All accounts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All accounts</SelectItem>
            {accounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.code} — {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="report-status" className="text-xs font-medium text-muted-foreground">
          Status
        </label>
        <Select value={status} onValueChange={(v) => updateParams({ status: v ?? undefined })}>
          <SelectTrigger id="report-status" className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="POSTED">Posted</SelectItem>
            <SelectItem value="POSTED,DRAFT">Posted + Draft</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="report-q" className="text-xs font-medium text-muted-foreground">
          Search
        </label>
        <Input
          id="report-q"
          placeholder="Reference or description"
          defaultValue={qParam}
          onChange={(e) => updateParams({ q: e.target.value || undefined })}
          className="w-[200px]"
        />
      </div>
    </div>
  );
}
