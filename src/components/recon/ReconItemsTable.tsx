'use client';
import { toggleReconMatch } from '@/server/actions/reconciliation-actions';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

type Item = { id: string; item_date: string; description: string; amount: number; matched_line_id: string | null };
type Ledger = { id: string; debit: number; credit: number; description: string | null };

export function ReconItemsTable({ reconId, items, ledgerLines }: { reconId: string; items: Item[]; ledgerLines: Ledger[] }) {
  void reconId;
  const onToggle = async (itemId: string, current: string | null) => {
    if (current) {
      const res = await toggleReconMatch(itemId, null);
      if (!res.ok) toast.error(res.formError ?? 'Failed');
      else toast.success('Unmatched');
    } else {
      // Auto-match by amount closest: pick first ledger line with matching amount (±0.01) not yet used
      const used = new Set(items.filter((it) => it.matched_line_id).map((it) => it.matched_line_id));
      const target = items.find((it) => it.id === itemId);
      if (!target) return;
      const amt = Number(target.amount);
      const candidate = ledgerLines.find((l) => {
        if (used.has(l.id)) return false;
        const lineAmt = Number(l.debit) - Number(l.credit);
        // Also try credit - debit for opposite sign
        return Math.abs(lineAmt - amt) < 0.01 || Math.abs(-lineAmt - amt) < 0.01;
      }) ?? ledgerLines.find((l) => !used.has(l.id));
      const lineId = candidate?.id ?? ledgerLines[0]?.id ?? null;
      if (!lineId) return toast.error('No ledger lines to match');
      const res = await toggleReconMatch(itemId, lineId);
      if (!res.ok) toast.error(res.formError ?? 'Failed');
      else toast.success('Matched');
    }
  };

  return (
    <div className="rounded border overflow-auto">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/50">
          <tr>
            <th className="p-2 text-left">Date</th>
            <th className="p-2 text-left">Description</th>
            <th className="p-2 text-right">Amount</th>
            <th className="p-2 text-left">Matched</th>
            <th className="p-2 text-left">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id} className="border-b last:border-0">
              <td className="p-2 whitespace-nowrap">{it.item_date}</td>
              <td className="p-2 truncate max-w-[260px]" title={it.description}>{it.description}</td>
              <td className="p-2 text-right">{Number(it.amount).toFixed(2)}</td>
              <td className="p-2 text-xs">{it.matched_line_id ? <span className="text-green-600">✓ {it.matched_line_id.slice(0, 8)}</span> : <span className="text-muted-foreground">—</span>}</td>
              <td className="p-2">
                <Button size="sm" variant="outline" onClick={() => onToggle(it.id, it.matched_line_id)}>
                  {it.matched_line_id ? 'Unmatch' : 'Match'}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
