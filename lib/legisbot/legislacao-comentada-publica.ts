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

/**
 * Consolida somente dispositivos que possuem uma fonte consistente em questions.
 * `status === concluido` é a regra já usada pelo botão humano Publicar do LegisBot.
 */
export function consolidarLegislacaoComentadaConfiavel(
  questions: QuestionContextRow[],
  comments: PublishedCommentRow[],
  fallbackTitle = "",
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

      return [{
        slug: source.slug.toUpperCase(),
        ordem: source.ordem,
        titulo,
        assunto,
        legislacao,
        comentario: commentByContext.get(`${source.slug.toUpperCase()}\u0000${source.ordem}`) ?? null,
      }];
    })
    .sort((a, b) => a.ordem.localeCompare(b.ordem));
}

/** Base reutilizável do LegisCast: fonte legal confiável + comentário já publicado, se houver. */
export async function buscarLegislacaoComentadaPublicaPorSlug(slug: string) {
  const slugNormalizado = slug.trim().toUpperCase();
  if (!slugNormalizado || isOfflineBuild()) return [];

  const db = getSupabaseServerClient();
  const [questionsResult, lawResult, commentsResult] = await Promise.all([
    db.from("questions").select("id,slug,ordem,titulo,assunto,legislacao,updated_at").eq("slug", slugNormalizado.toLowerCase()).eq("ativo", true),
    db.from("leis").select("titulo").eq("slug", slugNormalizado.toLowerCase()).maybeSingle(),
    db.from("legisbot_comentarios").select("slug,ordem,comentario,status").eq("slug", slugNormalizado).eq("status", "concluido").not("comentario", "is", null).neq("comentario", ""),
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
  );
}
