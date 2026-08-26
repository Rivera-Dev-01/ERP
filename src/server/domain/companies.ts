export function isArchived(status: string): boolean {
  return status === 'ARCHIVED';
}

export function canArchive(status: string): boolean {
  return status === 'ACTIVE';
}

export function isDuplicateError(error: { code?: string }): boolean {
  return error.code === '23505';
}
