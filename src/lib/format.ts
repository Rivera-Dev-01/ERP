import { toDecimal } from '@/lib/money';

const phpFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
});

export function formatPHP(value: string | number): string {
  return phpFormatter.format(toDecimal(value).toNumber());
}

const dateFormatter = new Intl.DateTimeFormat('en-PH', {
  month: 'short',
  day: '2-digit',
  year: 'numeric',
  timeZone: 'Asia/Manila',
});

export function formatBusinessDate(isoDate: string): string {
  return dateFormatter.format(new Date(`${isoDate}T12:00:00Z`));
}
