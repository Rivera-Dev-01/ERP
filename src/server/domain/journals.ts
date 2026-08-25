export function resolveFiscalPeriodError(error: { code?: string; message?: string }): string | null {
  if (
    (error as { code?: string }).code === 'P0001' &&
    /open fiscal period/i.test((error as { message?: string }).message ?? '')
  )
    return 'Date not in any open period';
  return null;
}

export function canPost(status: string): boolean {
  return status === 'DRAFT';
}

export function canReverse(status: string): boolean {
  return status === 'POSTED';
}
