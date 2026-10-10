import { createHash } from "node:crypto";

export const UPDATE_STEPS = ["legislacao", "questoes", "mapeamento", "materiais"] as const;
export type UpdateStep = typeof UPDATE_STEPS[number];

export function legislationSignature(value: string | null | undefined) {
  return createHash("sha256").update((value ?? "").replace(/\s+/g, " ").trim()).digest("hex");
}

export function normalizeSupportingOrders(values: unknown) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const item = value as Record<string, unknown>;
    const slug = typeof item.slug === "string" ? item.slug.trim().toLowerCase() : "";
    const ordem = typeof item.ordem === "string" ? item.ordem.trim() : "";
    return slug && ordem ? [{ slug, ordem }] : [];
  }).map((item) => `${item.slug}\0${item.ordem}`))].map((key) => {
    const [slug, ordem] = key.split("\0");
    return { slug, ordem };
  });
}

export function canConcludeLegislativeUpdate(status: string, completedSteps: Iterable<string>) {
  return status !== "concluida" && new Set(completedSteps).size === UPDATE_STEPS.length && UPDATE_STEPS.every((step) => new Set(completedSteps).has(step));
}
