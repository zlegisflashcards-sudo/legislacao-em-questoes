export function normalizeStudentEmail(value: string) {
  return value.trim().toLowerCase();
}

export function hasNormalizedEmail(rows: Array<{ email?: string | null }>, email: string) {
  const normalizedEmail = normalizeStudentEmail(email);
  return rows.some((row) => normalizeStudentEmail(row.email ?? "") === normalizedEmail);
}
