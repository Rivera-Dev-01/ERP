'use client';

import * as React from 'react';

import { AccountPicker } from '@/components/journal/AccountPicker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatPHP } from '@/lib/format';
import { isBalanced, toDecimal } from '@/lib/money';

export type LineRow = {
  account_id: string;
  description: string;
  debit: string;
  credit: string;
  tax_code: string;
};

type Props = {
  accounts: Array<{ id: string; code: string; name: string }>;
  value: LineRow[];
  onValueChange: (lines: LineRow[]) => void;
  // alias props for flexibility (lines / onLinesChange)
  lines?: LineRow[];
  onLinesChange?: (lines: LineRow[]) => void;
};

function blankRow(): LineRow {
  return { account_id: '', description: '', debit: '0', credit: '0', tax_code: '' };
}

function toSafeDecimal(v: string): ReturnType<typeof toDecimal> | null {
  try {
    return toDecimal(v || '0');
  } catch {
    return null;
  }
}

export function LineGrid(props: Props) {
  const accounts = props.accounts;
  const lines = React.useMemo(
    () => props.value ?? props.lines ?? [],
    [props.value, props.lines],
  );
  const onValueChange = React.useMemo(
    () => props.onValueChange ?? props.onLinesChange,
    [props.onValueChange, props.onLinesChange],
  );

  const containerRef = React.useRef<HTMLDivElement>(null);

  // Ensure we always have at least 2 rows for UX if empty? Keep as-is but helpers handle empty.
  const setLines = React.useCallback(
    (next: LineRow[]) => {
      onValueChange?.(next);
    },
    [onValueChange],
  );

  const updateRow = React.useCallback(
    (index: number, patch: Partial<LineRow>) => {
      const next = lines.map((r, i) => (i === index ? { ...r, ...patch } : r));
      setLines(next);
    },
    [lines, setLines],
  );

  const addRow = React.useCallback(() => {
    setLines([...lines, blankRow()]);
    // focus new row's account picker after render
    requestAnimationFrame(() => {
      const el = containerRef.current?.querySelectorAll<HTMLElement>('[data-grid-input]');
      if (!el || el.length === 0) return;
      // focus last account cell (first col of last row)
      // find last element with data-col="account"
      for (let i = el.length - 1; i >= 0; i--) {
        if (el[i].getAttribute('data-col') === 'account') {
          el[i].focus();
          break;
        }
      }
    });
  }, [lines, setLines]);

  const duplicateRow = React.useCallback(
    (index: number) => {
      const row = lines[index];
      if (!row) return;
      const next = [...lines.slice(0, index + 1), { ...row }, ...lines.slice(index + 1)];
      setLines(next);
    },
    [lines, setLines],
  );

  const removeRow = React.useCallback(
    (index: number) => {
      if (lines.length <= 1) {
        // clear instead of removing last row
        updateRow(index, blankRow());
        return;
      }
      const next = lines.filter((_, i) => i !== index);
      setLines(next);
    },
    [lines, setLines, updateRow],
  );

  const totals = React.useMemo(() => {
    let debitSum: ReturnType<typeof toDecimal> | null = null;
    let creditSum: ReturnType<typeof toDecimal> | null = null;
    try {
      debitSum = lines.reduce((acc, l) => acc.plus(toDecimal(l.debit || '0')), toDecimal('0'));
      creditSum = lines.reduce((acc, l) => acc.plus(toDecimal(l.credit || '0')), toDecimal('0'));
    } catch {
      // keep null
    }
    const debits = lines.map((l) => l.debit || '0');
    const credits = lines.map((l) => l.credit || '0');
    let balanced = false;
    try {
      balanced = isBalanced(debits, credits);
    } catch {
      balanced = false;
    }
    return { debitSum, creditSum, balanced };
  }, [lines]);

  const totalDebitStr = totals.debitSum ? totals.debitSum.toFixed(2) : '0.00';
  const totalCreditStr = totals.creditSum ? totals.creditSum.toFixed(2) : '0.00';
  const differenceStr = (() => {
    if (!totals.debitSum || !totals.creditSum) return '0.00';
    return totals.debitSum.minus(totals.creditSum).toFixed(2);
  })();

  const handleGridKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      const isInput = target.hasAttribute('data-grid-input');
      if (!isInput && target.tagName !== 'INPUT' && target.tagName !== 'BUTTON') return;

      if (e.key === 'Enter') {
        e.preventDefault();
        addRow();
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        // find row index via closest [data-row]
        const rowEl = target.closest<HTMLElement>('[data-row]');
        const idxStr = rowEl?.getAttribute('data-row-index');
        const idx = idxStr ? Number.parseInt(idxStr, 10) : -1;
        if (idx >= 0 && idx < lines.length) {
          // clear row
          updateRow(idx, blankRow());
          // focus description of same row if exists
          requestAnimationFrame(() => {
            const inputs = containerRef.current?.querySelectorAll<HTMLElement>('[data-grid-input]');
            if (!inputs) return;
            // find description of that row
            for (const el of Array.from(inputs)) {
              if (
                el.getAttribute('data-row-index') === String(idx) &&
                el.getAttribute('data-col') === 'description'
              ) {
                el.focus();
                break;
              }
            }
          });
        } else {
          // fallback: clear value of current input if it's Input
          if (target instanceof HTMLInputElement) {
            const col = target.getAttribute('data-col');
            if (col === 'description' || col === 'tax_code') target.value = '';
            if (col === 'debit' || col === 'credit') target.value = '0';
            target.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
        return;
      }

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const inputs = Array.from(
          containerRef.current?.querySelectorAll<HTMLElement>('[data-grid-input]') ?? [],
        );
        const idx = inputs.indexOf(target);
        if (idx === -1) return;
        const col = target.getAttribute('data-col');
        if (!col) return;
        if (e.key === 'ArrowDown') {
          for (let i = idx + 1; i < inputs.length; i++) {
            if (inputs[i].getAttribute('data-col') === col) {
              inputs[i].focus();
              break;
            }
          }
        } else {
          for (let i = idx - 1; i >= 0; i--) {
            if (inputs[i].getAttribute('data-col') === col) {
              inputs[i].focus();
              break;
            }
          }
        }
      }
      // Tab is default
    },
    [addRow, lines.length, updateRow],
  );

  return (
    <div
      ref={containerRef}
      onKeyDown={handleGridKeyDown}
      className="overflow-x-auto rounded-lg border"
      role="grid"
      aria-label="Journal lines"
    >
      <table className="w-full min-w-[900px] border-collapse text-sm">
        <thead>
          <tr className="bg-muted/50 text-left">
            <th className="px-3 py-2 font-medium">Account</th>
            <th className="px-3 py-2 font-medium">Description</th>
            <th className="px-3 py-2 font-medium">Debit</th>
            <th className="px-3 py-2 font-medium">Credit</th>
            <th className="px-3 py-2 font-medium">Tax code</th>
            <th className="px-3 py-2 font-medium w-[140px]">Actions</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((row, idx) => (
            <tr key={idx} data-row data-row-index={String(idx)} className="border-t">
              <td className="px-2 py-2">
                <AccountPicker
                  accounts={accounts}
                  value={row.account_id}
                  onValueChange={(v) => updateRow(idx, { account_id: v })}
                  rowIndex={idx}
                />
              </td>
              <td className="px-2 py-2">
                <Input
                  data-grid-input
                  data-col="description"
                  data-row-index={String(idx)}
                  value={row.description}
                  onChange={(e) => updateRow(idx, { description: e.target.value })}
                  placeholder="Line description"
                  aria-label={`Description row ${idx + 1}`}
                />
              </td>
              <td className="px-2 py-2">
                <Input
                  data-grid-input
                  data-col="debit"
                  data-row-index={String(idx)}
                  value={row.debit}
                  inputMode="decimal"
                  onChange={(e) => {
                    const v = e.target.value;
                    // mutually exclusive: clear credit when debit is positive
                    const num = Number.parseFloat(v || '0');
                    if (Number.isFinite(num) && num > 0) {
                      updateRow(idx, { debit: v, credit: '0' });
                    } else {
                      updateRow(idx, { debit: v });
                    }
                  }}
                  placeholder="0.00"
                  aria-label={`Debit row ${idx + 1}`}
                />
              </td>
              <td className="px-2 py-2">
                <Input
                  data-grid-input
                  data-col="credit"
                  data-row-index={String(idx)}
                  value={row.credit}
                  inputMode="decimal"
                  onChange={(e) => {
                    const v = e.target.value;
                    const num = Number.parseFloat(v || '0');
                    if (Number.isFinite(num) && num > 0) {
                      updateRow(idx, { credit: v, debit: '0' });
                    } else {
                      updateRow(idx, { credit: v });
                    }
                  }}
                  placeholder="0.00"
                  aria-label={`Credit row ${idx + 1}`}
                />
              </td>
              <td className="px-2 py-2">
                <Input
                  data-grid-input
                  data-col="tax_code"
                  data-row-index={String(idx)}
                  value={row.tax_code}
                  onChange={(e) => updateRow(idx, { tax_code: e.target.value })}
                  placeholder="Tax"
                  aria-label={`Tax code row ${idx + 1}`}
                />
              </td>
              <td className="px-2 py-2">
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => duplicateRow(idx)}
                    aria-label={`Duplicate row ${idx + 1}`}
                    title="Duplicate"
                  >
                    <span className="sr-only">Duplicate</span>
                    {/* Copy icon via text fallback */}
                    ⧉
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => removeRow(idx)}
                    aria-label={`Remove row ${idx + 1}`}
                    title="Remove"
                  >
                    ×
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="sticky bottom-0 border-t bg-background font-medium">
            <td colSpan={2} className="px-3 py-2 text-right">
              Total
            </td>
            <td className="px-3 py-2">
              <span aria-label="Total debit">{formatPHP(totalDebitStr)}</span>
            </td>
            <td className="px-3 py-2">
              <span aria-label="Total credit">{formatPHP(totalCreditStr)}</span>
            </td>
            <td className="px-3 py-2" colSpan={2}>
              <span className="flex flex-col gap-1">
                <span aria-label="Difference">
                  Difference: {formatPHP(differenceStr)}
                </span>
                <span
                  className={totals.balanced ? 'text-green-600' : 'text-destructive'}
                  aria-live="polite"
                >
                  {totals.balanced ? 'Balanced' : 'Unbalanced'}
                </span>
                <span className="sr-only">isBalanced:{String(totals.balanced)}</span>
              </span>
            </td>
          </tr>
        </tfoot>
      </table>
      <div className="flex gap-2 border-t bg-muted/20 p-2">
        <Button type="button" variant="outline" size="sm" onClick={addRow}>
          Add line
        </Button>
        <span className="text-xs text-muted-foreground self-center">
          Tab to move, Enter for new row, Esc to clear, ArrowUp/Down to navigate column
        </span>
      </div>
      {/* hidden helper for toSafeDecimal usage to avoid unused */}
      <span className="hidden">{toSafeDecimal('0')?.toString()}</span>
    </div>
  );
}
