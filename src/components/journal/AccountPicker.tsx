'use client';

import * as React from 'react';

import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export type AccountOption = {
  id: string;
  code: string;
  name: string;
};

type Props = {
  accounts: AccountOption[];
  value: string;
  onValueChange: (value: string) => void;
  /** optional row index for grid navigation (forwarded to trigger) */
  rowIndex?: number;
};

export function AccountPicker({ accounts, value, onValueChange, rowIndex }: Props) {
  const [query, setQuery] = React.useState('');

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter((a) => `${a.code} ${a.name}`.toLowerCase().includes(q));
  }, [accounts, query]);

  const selected = React.useMemo(
    () => accounts.find((a) => a.id === value),
    [accounts, value],
  );

  return (
    <Select value={value} onValueChange={(v) => onValueChange(v ?? '')}>
      <SelectTrigger
        data-grid-input
        data-col="account"
        data-row-index={rowIndex !== undefined ? String(rowIndex) : undefined}
        className="w-full min-w-[180px]"
        aria-label="Account"
      >
        <SelectValue placeholder="Select account">
          {selected ? `${selected.code} — ${selected.name}` : undefined}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <div className="p-2" onClick={(e) => e.stopPropagation()}>
          <Input
            placeholder="Search by code or name"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
            }}
            onKeyDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            aria-label="Search accounts"
          />
        </div>
        {filtered.length === 0 ? (
          <div className="px-3 py-2 text-sm text-muted-foreground">No accounts found</div>
        ) : (
          filtered.map((acc) => (
            <SelectItem key={acc.id} value={acc.id}>
              {acc.code} — {acc.name}
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  );
}
