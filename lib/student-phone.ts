/** Normaliza formatos brasileiros comuns sem exigir que o aluno informe +55. */
export function normalizeStudentPhone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const digits = value.replace(/\D/g, "");
  const national = (digits.length === 12 || digits.length === 13) && digits.startsWith("55") ? digits.slice(2) : digits;
  if (!/^[1-9]\d{9,10}$/.test(national)) return null;
  return `+55${national}`;
}
