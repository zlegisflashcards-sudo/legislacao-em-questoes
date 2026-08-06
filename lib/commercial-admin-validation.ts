export class CommercialValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommercialValidationError";
  }
}

export const COMMERCIAL_ORIGINS = [
  "hotmart",
  "cortesia",
  "amostra",
  "premiacao",
  "migracao",
  "administrativo",
] as const;

export const MANUAL_ORIGINS = [
  "cortesia",
  "amostra",
  "premiacao",
  "migracao",
  "administrativo",
] as const;

export const MATERIAL_TYPES = ["flashcards", "video", "pdf", "tutorial", "audio", "outro"] as const;
export const MATERIAL_PROVIDERS = ["google_drive", "youtube", "externo", "supabase_storage"] as const;
export const MATERIAL_ACTIONS = ["abrir", "baixar", "assistir"] as const;
export const PRODUCT_TYPES = ["lei_avulsa", "combo", "edital", "assinatura", "outro"] as const;
export const LAW_UPDATE_STATUSES = ["atualizado", "revisao_pendente", "desatualizado", "em_revisao"] as const;
export const EDITORIAL_UPDATE_TYPES = [
  "alteracao_legislativa", "nova_versao_flashcards", "novas_questoes", "correcao_questoes",
  "correcao_flashcards", "melhoria_material", "outro",
] as const;
export const EDITORIAL_IMPORTANCE = ["informativa", "recomendada", "essencial"] as const;

export type JsonObject = Record<string, unknown>;

export function asObject(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CommercialValidationError("O corpo da requisição deve ser um objeto JSON.");
  }
  return value as JsonObject;
}

export function rejectUnknownKeys(value: JsonObject, allowed: readonly string[]) {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length) throw new CommercialValidationError("A requisição contém campos não permitidos.");
}

export function requiredString(value: unknown, label: string, max = 500): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new CommercialValidationError(`${label} é obrigatório.`);
  }
  const normalized = value.trim();
  if (normalized.length > max) throw new CommercialValidationError(`${label} excede o limite permitido.`);
  return normalized;
}

export function optionalString(value: unknown, label: string, max = 2000): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string") throw new CommercialValidationError(`${label} é inválido.`);
  const normalized = value.trim();
  if (normalized.length > max) throw new CommercialValidationError(`${label} excede o limite permitido.`);
  return normalized || null;
}

export function booleanValue(value: unknown, label: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new CommercialValidationError(`${label} deve ser verdadeiro ou falso.`);
  return value;
}

export function nonNegativeInteger(value: unknown, label: string, fallback?: number): number {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new CommercialValidationError(`${label} deve ser um número inteiro maior ou igual a zero.`);
  }
  return value;
}

export function optionalNonNegativeInteger(value: unknown, label: string): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  return nonNegativeInteger(value, label);
}

export function optionalIsoDate(value: unknown, label: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new CommercialValidationError(`${label} deve usar o formato AAAA-MM-DD.`);
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new CommercialValidationError(`${label} não é uma data válida.`);
  }
  return value;
}

export function optionalTimestamp(value: unknown, label: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:?\d{2})?$/.test(value)) {
    throw new CommercialValidationError(`${label} possui data e hora inválidas.`);
  }
  if (Number.isNaN(Date.parse(value))) throw new CommercialValidationError(`${label} possui data e hora inválidas.`);
  return value;
}

export function positiveIntegerId(value: unknown, label: string): number {
  if (typeof value === "string" && /^\d+$/.test(value)) value = Number(value);
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new CommercialValidationError(`${label} é inválido.`);
  }
  return value;
}

export function uuid(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new CommercialValidationError(`${label} é inválido.`);
  }
  return value.toLowerCase();
}

export function slug(value: unknown, label = "Slug"): string {
  const normalized = requiredString(value, label, 160).toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized)) {
    throw new CommercialValidationError(`${label} deve conter apenas letras minúsculas, números e hífens.`);
  }
  return normalized;
}

export function enumValue<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new CommercialValidationError(`${label} possui um valor inválido.`);
  }
  return value as T;
}

export function idList(value: unknown, label: string): number[] {
  if (!Array.isArray(value) || value.length > 500) throw new CommercialValidationError(`${label} é inválida.`);
  const ids = value.map((item) => positiveIntegerId(item, label));
  if (new Set(ids).size !== ids.length) throw new CommercialValidationError(`${label} contém itens duplicados.`);
  return ids;
}

export function pageFrom(value: string | null): number {
  const parsed = Number(value ?? "1");
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, 10000) : 1;
}

export function limitFrom(value: string | null): number {
  const parsed = Number(value ?? "25");
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, 50) : 25;
}

export function safeSearch(value: string | null, max = 120): string {
  return (value ?? "").trim().slice(0, max).replace(/[%(),]/g, " ");
}

export function publicErrorMessage(error: unknown): string {
  if (error instanceof CommercialValidationError) return error.message;
  return "Não foi possível concluir a operação comercial.";
}
