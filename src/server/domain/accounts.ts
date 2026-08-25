export const ACCOUNT_HEADERS = [
  'Account Code',
  'Account Name',
  'Account Type',
  'Normal Balance',
  'Active',
] as const;
export function coerceActive(v: string): boolean {
  const s = String(v ?? '')
    .trim()
    .toLowerCase();
  if (['true', '1', 'yes', 'y'].includes(s)) return true;
  if (['false', '0', 'no', 'n'].includes(s)) return false;
  return s === '' ? true : false; // default active when blank
}
