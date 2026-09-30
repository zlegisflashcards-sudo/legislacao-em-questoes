import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LegisBotIdentifiers } from "./request-validation";
import { legalHtmlToStructuredText, sanitizeLegalHtmlCore } from "./sanitize-legal-html-core";

type QuestionSourceRow = {
  id: string;
  slug: string;
  ordem: string;
  titulo: string | null;
  assunto: string | null;
  legislacao: string | null;
  updated_at: string;
};

export type LegisBotSource = {
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
  constructor(
    public readonly kind: "not_found" | "incomplete" | "conflict" | "unavailable",
    public readonly publicMessage: string,
  ) {
    super(publicMessage);
    this.name = "LegisBotSourceError";
  }
}

export function normalizedLegisBotSourceText(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase("pt-BR");
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

function buildSource(row: QuestionSourceRow, identifiers: LegisBotIdentifiers, fallbackTitle: string | null): LegisBotSource {
  const titulo = row.titulo?.trim() || fallbackTitle?.trim() || "";
  const assunto = row.assunto?.trim() || "";
  const legislacao = sanitizeLegalHtmlCore(row.legislacao ?? "").trim();
  const promptLegislacao = legalHtmlToStructuredText(legislacao);
  if (!titulo || !assunto || !promptLegislacao || titulo.length > 255 || assunto.length > 255 || legislacao.length > 16_000 || promptLegislacao.length > 16_000) {
    throw new LegisBotSourceError("incomplete", "O flashcard não possui todos os dados necessários para o LegisBot.");
  }
  const source = {
    questionId: row.id,
    slug: identifiers.slug,
    ordem: identifiers.ordem,
    titulo,
    assunto,
    legislacao,
    promptLegislacao,
    signature: "",
  };
  return { ...source, signature: createLegisBotSourceSignature(source) };
}

export function resolveLegisBotSourceRows(
  rows: QuestionSourceRow[],
  identifiers: LegisBotIdentifiers,
  fallbackTitle: string | null,
) {
  const sources = rows.map((row) => buildSource(row, identifiers, fallbackTitle));
  const legislationVersions = new Set(sources.map((source) => normalizedLegisBotLegislation(source.legislacao)));
  if (legislationVersions.size > 1) {
    throw new LegisBotSourceError(
      "conflict",
      "Este conteúdo está temporariamente indisponível enquanto passa por revisão.",
    );
  }
  return sources[0];
}

/** Resolve a fonte canônica exclusivamente no servidor, pela identidade slug + ordem. */
export async function findLegisBotSource(
  supabase: SupabaseClient,
  identifiers: LegisBotIdentifiers,
): Promise<LegisBotSource> {
  const { data, error } = await supabase
    .from("questions")
    .select("id,slug,ordem,titulo,assunto,legislacao,updated_at")
    .eq("slug", identifiers.slug.toLowerCase())
    .eq("ordem", identifiers.ordem)
    .eq("ativo", true)
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false });
  if (error) throw new LegisBotSourceError("unavailable", "Não foi possível consultar o flashcard.");
  const rows = (data ?? []) as QuestionSourceRow[];
  if (!rows.length) throw new LegisBotSourceError("not_found", "Trecho não encontrado.");

  const { data: law, error: lawError } = await supabase
    .from("leis")
    .select("titulo")
    .eq("slug", identifiers.slug.toLowerCase())
    .maybeSingle();
  if (lawError) throw new LegisBotSourceError("unavailable", "Não foi possível consultar a legislação.");

  return resolveLegisBotSourceRows(rows, identifiers, law?.titulo ? String(law.titulo) : null);
}
