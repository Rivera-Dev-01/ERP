export function isOverlapError(error: { code?: string; message?: string }): boolean {
  // Postgres exclusion violation surfaces as code 23P01 or message containing "overlaps" / "exclusion"
  return error.code === '23P01' || /overlap|exclusion/i.test(error.message ?? '');
}
