import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LegisBotIdentifiers } from "./request-validation";
import { legalHtmlToStructuredText, sanitizeLegalHtmlCore } from "./sanitize-legal-html-core";
import { validateQuestionStructure } from "@/lib/question-structure-consistency";
import { legisBotOrderCandidates } from "./order-candidates";

type QuestionSourceRow = { id: string; slug: string; ordem: string; titulo: string | null; assunto: string | null; legislacao: string | null; updated_at: string };
type ReferenceRow = { id: string; slug: string; ordem: string; identificacao: string; legislacao: string | null };

export type LegisBotSource = {
  referenceId: string | null;
  questionId: string;
  slug: string;
  ordem: string;
  titulo: string;
  assunto: string;
  legislacao: string;
  promptLegislacao: string;
  signature: string;
};

export class LegisBotSourceError extends Error {
  constructor(public readonly kind: "not_found" | "incomplete" | "conflict" | "unavailable", public readonly publicMessage: string) {
    super(publicMessage);
    this.name = "LegisBotSourceError";
  }
}

export function normalizedLegisBotSourceText(value: string) {
  return value.normalize("NFKC").replace(/\/(?:19|20)(\d{2})\b/g, "/$1").replace(/\s+/g, " ").trim().toLocaleLowerCase("pt-BR");
}

export function normalizedLegisBotLegislation(legislacao: string) {
  return normalizedLegisBotSourceText(legalHtmlToStructuredText(legislacao));
}

export function createLegisBotSourceSignature(input: Pick<LegisBotSource, "titulo" | "assunto" | "promptLegislacao">) {
  return createHash("sha256").update(JSON.stringify([
    normalizedLegisBotSourceText(input.titulo),
    normalizedLegisBotSourceText(input.assunto),
    normalizedLegisBotSourceText(input.promptLegislacao),
  ])).digest("hex");
}

export { legisBotOrderCandidates } from "./order-candidates";

function buildReferenceSource(reference: ReferenceRow, title: string | null): LegisBotSource {
  const legislacao = sanitizeLegalHtmlCore(reference.legislacao ?? "").trim();
  const promptLegislacao = legalHtmlToStructuredText(legislacao);
  const assunto = reference.identificacao.trim();
  const titulo = title?.trim() || reference.slug.toUpperCase();
  if (!legislacao || !promptLegislacao) throw new LegisBotSourceError("incomplete", "A legislação preparada deste dispositivo ainda não está disponível.");
  const source = { referenceId: reference.id, questionId: `reference:${reference.id}`, slug: reference.slug.toUpperCase(), ordem: reference.ordem, titulo, assunto, legislacao, promptLegislacao, signature: "" };
  return { ...source, signature: createLegisBotSourceSignature(source) };
}

/** Fonte persistente da Etapa 3. Nunca consulta questions. */
export async function findLegisBotSource(supabase: SupabaseClient, identifiers: LegisBotIdentifiers): Promise<LegisBotSource> {
  const [referenceResult, lawResult] = await Promise.all([
    supabase.from("legislative_references").select("id,slug,ordem,identificacao,legislacao").eq("slug", identifiers.slug.toLowerCase()).eq("ordem", identifiers.ordem).maybeSingle(),
    supabase.from("leis").select("titulo").eq("slug", identifiers.slug.toLowerCase()).maybeSingle(),
  ]);
  if (referenceResult.error || lawResult.error) throw new LegisBotSourceError("unavailable", "Não foi possível consultar a base legislativa.");
  if (!referenceResult.data) throw new LegisBotSourceError("not_found", "A referência legislativa deste dispositivo não foi identificada.");
  return buildReferenceSource(referenceResult.data as ReferenceRow, lawResult.data?.titulo ? String(lawResult.data.titulo) : null);
}

/** Retorna a primeira fonte preparada na cadeia de pais, sem tocar nas questões. */
export async function findHierarchicalLegisBotSource(supabase: SupabaseClient, identifiers: LegisBotIdentifiers) {
  const candidates = legisBotOrderCandidates(identifiers.ordem);
  const result = await supabase.from("legislative_references").select("id,slug,ordem,identificacao,legislacao").eq("slug", identifiers.slug.toLowerCase()).in("ordem", candidates);
  if (result.error) throw new LegisBotSourceError("unavailable", "Não foi possível consultar a base legislativa.");
  const byOrder = new Map((result.data ?? []).map((row) => [String(row.ordem), row as ReferenceRow]));
  const law = await supabase.from("leis").select("titulo").eq("slug", identifiers.slug.toLowerCase()).maybeSingle();
  if (law.error) throw new LegisBotSourceError("unavailable", "Não foi possível consultar a legislação.");
  for (const ordem of candidates) {
    const row = byOrder.get(ordem);
    if (!row) continue;
    try {
      return buildReferenceSource(row, law.data?.titulo ? String(law.data.titulo) : null);
    } catch (error) {
      if (!(error instanceof LegisBotSourceError) || error.kind !== "incomplete") throw error;
    }
  }
  throw new LegisBotSourceError("incomplete", "Não há legislação preparada disponível para este dispositivo ou seus superiores.");
}

// Mantido para os validadores de importação e testes; não é chamado pelo LegisBot.
export function resolveLegisBotSourceRows(rows: QuestionSourceRow[], identifiers: LegisBotIdentifiers, fallbackTitle: string | null) {
  if (rows.some((row) => validateQuestionStructure(row).status !== "valid")) throw new LegisBotSourceError("conflict", "Este conteúdo está temporariamente indisponível enquanto o conflito estrutural entre Assunto e Ordem é revisado.");
  const first = rows[0];
  if (!first) throw new LegisBotSourceError("not_found", "Trecho não encontrado.");
  const legislacao = sanitizeLegalHtmlCore(first.legislacao ?? "").trim();
  const promptLegislacao = legalHtmlToStructuredText(legislacao);
  const titulo = first.titulo?.trim() || fallbackTitle?.trim() || "";
  const assunto = first.assunto?.trim() || "";
  if (!titulo || !assunto || !promptLegislacao) throw new LegisBotSourceError("incomplete", "O flashcard não possui todos os dados necessários para o LegisBot.");
  const source = { referenceId: null, questionId: first.id, slug: identifiers.slug, ordem: identifiers.ordem, titulo, assunto, legislacao, promptLegislacao, signature: "" };
  const subjects = new Set(rows.map((row) => normalizedLegisBotSourceText(row.assunto ?? "")));
  const laws = new Set(rows.map((row) => normalizedLegisBotLegislation(row.legislacao ?? "")));
  if (subjects.size > 1 || laws.size > 1) throw new LegisBotSourceError("conflict", "Este conteúdo está temporariamente indisponível enquanto passa por revisão.");
  return { ...source, signature: createLegisBotSourceSignature(source) };
}
