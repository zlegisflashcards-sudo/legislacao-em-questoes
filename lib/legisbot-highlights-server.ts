import "server-only";

import { CommunityApiError } from "@/lib/legisbot-community-server";
import { normalizeLegalText } from "@/lib/legisbot-highlights";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { findHierarchicalLegisBotSource, LegisBotSourceError } from "@/lib/legisbot/source";
import { normalizeLegisBotIdentifiers } from "@/lib/legisbot/request-validation";

export async function getStoredLegislationText(slug: string, ordem: string) {
  try {
    const source = await findHierarchicalLegisBotSource(
      getSupabaseServerClient(),
      normalizeLegisBotIdentifiers(slug, ordem),
    );
    // Destaques são posicionados no texto exibido ao aluno. Ele usa a
    // conversão simples de HTML para texto, que também é a base do trigger
    // canônico de destaques. `promptLegislacao` preserva uma estrutura extra
    // para a geração por IA e pode produzir quebras diferentes.
    return normalizeLegalText(source.legislacao);
  } catch (error) {
    if (error instanceof LegisBotSourceError) {
      throw new CommunityApiError(error.kind === "not_found" ? 404 : 409, error.publicMessage);
    }
    throw error;
  }
}

export async function getStoredLegislationSource(slug: string, ordem: string) {
  try {
    const source = await findHierarchicalLegisBotSource(
      getSupabaseServerClient(),
      normalizeLegisBotIdentifiers(slug, ordem),
    );
    if (!source.referenceId) {
      throw new CommunityApiError(404, "A referência legislativa deste dispositivo não foi identificada.");
    }
    return { referenceId: source.referenceId, text: normalizeLegalText(source.legislacao) };
  } catch (error) {
    if (error instanceof CommunityApiError) throw error;
    if (error instanceof LegisBotSourceError) {
      throw new CommunityApiError(error.kind === "not_found" ? 404 : 409, error.publicMessage);
    }
    throw error;
  }
}

export function highlightJsonError(error: unknown) {
  if (error instanceof CommunityApiError) {
    return Response.json({ success: false, message: error.publicMessage }, { status: error.status });
  }
  console.error("Falha nos destaques pessoais do LegisBot", error instanceof Error ? error.message : "erro desconhecido");
  return Response.json(
    { success: false, message: "Não foi possível concluir a operação no momento." },
    { status: 500 },
  );
}
