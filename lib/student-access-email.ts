export function normalizeStudentAccessEmail(value: string) {
  return value.trim().toLowerCase();
}

export function isValidStudentAccessEmail(value: unknown): value is string {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
