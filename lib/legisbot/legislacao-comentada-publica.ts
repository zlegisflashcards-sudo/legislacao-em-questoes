import { isOfflineBuild } from "../build-mode";
import { getSupabaseServerClient } from "../supabase-server";
import { sanitizeLegalHtmlCore } from "./sanitize-legal-html-core";
import { normalizedLegisBotLegislation, normalizedLegisBotSourceText } from "./source";
import { validateQuestionStructure } from "@/lib/question-structure-consistency";

export type LegislacaoComentadaPublica = {
  slug: string;
  ordem: string;
  assunto: string;
  titulo: string;
  legislacao: string;
  comentario: string | null;
  incidencia: "muito_alta" | "alta" | "media" | "baixa" | "nao_mapeado";
  artigo_recente: boolean;
};

type QuestionContextRow = {
  id: string;
  slug: string;
  ordem: string;
  titulo: string | null;
  assunto: string | null;
  legislacao: string | null;
  updated_at: string;
};

type PublishedCommentRow = {
  slug: string;
  ordem: string;
  comentario: string | null;
  status: string;
};

type ArticleMappingRow = {
  slug: string;
  ordem: string;
  incidencia: string | null;
  artigo_recente: boolean | null;
};

const INCIDENCIAS_PUBLICAS = new Set<LegislacaoComentadaPublica["incidencia"]>(["muito_alta", "alta", "media", "baixa", "nao_mapeado"]);

function incidenciaPublica(value: string | null | undefined): LegislacaoComentadaPublica["incidencia"] {
  return value && INCIDENCIAS_PUBLICAS.has(value as LegislacaoComentadaPublica["incidencia"])
    ? value as LegislacaoComentadaPublica["incidencia"]
    : "nao_mapeado";
}

/**
 * Consolida somente dispositivos que possuem uma fonte consistente em questions.
 * `status === concluido` é a regra já usada pelo botão humano Publicar do LegisBot.
 */
export function consolidarLegislacaoComentadaConfiavel(
  questions: QuestionContextRow[],
  comments: PublishedCommentRow[],
  fallbackTitle = "",
  mappings: ArticleMappingRow[] = [],
): LegislacaoComentadaPublica[] {
  const grouped = new Map<string, QuestionContextRow[]>();
  for (const question of questions) {
    const key = `${question.slug.toUpperCase()}\u0000${question.ordem}`;
    grouped.set(key, [...(grouped.get(key) ?? []), question]);
  }
  const commentByContext = new Map(
    comments
      .filter((comment) => comment.status === "concluido" && Boolean(comment.comentario?.trim()))
      .map((comment) => [`${comment.slug.toUpperCase()}\u0000${comment.ordem}`, comment.comentario?.trim() ?? ""]),
  );
  const mappingByContext = new Map(
    mappings.map((mapping) => [`${mapping.slug.toUpperCase()}\u0000${mapping.ordem}`, { incidencia: incidenciaPublica(mapping.incidencia), artigo_recente: mapping.artigo_recente === true }]),
  );

  return [...grouped.values()]
    .flatMap((group) => {
      const ordered = [...group].sort((a, b) => b.updated_at.localeCompare(a.updated_at) || b.id.localeCompare(a.id));
      const source = ordered[0];
      const legislacao = sanitizeLegalHtmlCore(source.legislacao ?? "").trim();
      const assunto = source.assunto?.trim() ?? "";
      const titulo = source.titulo?.trim() || fallbackTitle;
      if (!legislacao || !assunto || !titulo) return [];

      const legislations = new Set(group.map((item) => normalizedLegisBotLegislation(item.legislacao ?? "")));
      const subjects = new Set(group.map((item) => normalizedLegisBotSourceText(item.assunto ?? "")));
      if (legislations.size !== 1 || subjects.size !== 1 || group.some((item) => validateQuestionStructure(item).status !== "valid")) return [];

      const mapping = mappingByContext.get(`${source.slug.toUpperCase()}\u0000${source.ordem}`);
      return [{
        slug: source.slug.toUpperCase(),
        ordem: source.ordem,
        titulo,
        assunto,
        legislacao,
        comentario: commentByContext.get(`${source.slug.toUpperCase()}\u0000${source.ordem}`) ?? null,
        incidencia: mapping?.incidencia ?? "nao_mapeado",
        artigo_recente: mapping?.artigo_recente ?? false,
      }];
    })
    .sort((a, b) => a.ordem.localeCompare(b.ordem));
}

/** Base reutilizável do LegisCast: fonte legal confiável + comentário já publicado, se houver. */
export async function buscarLegislacaoComentadaPublicaPorSlug(slug: string) {
  const slugNormalizado = slug.trim().toUpperCase();
  if (!slugNormalizado || isOfflineBuild()) return [];

  const db = getSupabaseServerClient();
  const [questionsResult, lawResult, commentsResult, mappingsResult] = await Promise.all([
    db.from("questions").select("id,slug,ordem,titulo,assunto,legislacao,updated_at").eq("slug", slugNormalizado.toLowerCase()).eq("ativo", true),
    db.from("leis").select("titulo").eq("slug", slugNormalizado.toLowerCase()).maybeSingle(),
    db.from("legisbot_comentarios").select("slug,ordem,comentario,status").eq("slug", slugNormalizado).eq("status", "concluido").eq("context_kind", "comment").not("comentario", "is", null).neq("comentario", ""),
    db.from("article_context_mappings").select("slug,ordem,incidencia,artigo_recente").eq("slug", slugNormalizado.toLowerCase()),
  ]);
  if (questionsResult.error || lawResult.error || commentsResult.error) {
    console.error("Erro ao carregar a legislação comentada confiável do LegisCast:", {
      slug: slugNormalizado,
      questions: questionsResult.error?.message,
      law: lawResult.error?.message,
      comments: commentsResult.error?.message,
    });
    return [];
  }
  return consolidarLegislacaoComentadaConfiavel(
    (questionsResult.data ?? []) as QuestionContextRow[],
    (commentsResult.data ?? []) as PublishedCommentRow[],
    lawResult.data?.titulo ? String(lawResult.data.titulo) : "",
    mappingsResult.error ? [] : (mappingsResult.data ?? []) as ArticleMappingRow[],
  );
}
