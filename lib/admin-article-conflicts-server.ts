import "server-only";

import { obterAdministrador } from "@/lib/admin-auth";
import { applyBulkQuestionEdit, deactivateAdminQuestion } from "@/lib/admin-questoes-server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { normalizeLegisBotIdentifiers } from "@/lib/legisbot/request-validation";
import { createLegisBotSourceSignature } from "@/lib/legisbot/source";
import { legalHtmlToStructuredText, sanitizeLegalHtmlCore } from "@/lib/legisbot/sanitize-legal-html-core";
import {
  compareLegislationText,
  groupLegisBotSourceConflicts,
  legislationVersionId,
  type LegisBotConflictGroup,
  type LegisBotConflictQuestion,
} from "@/lib/legisbot/source-conflicts";

const PAGE_SIZE = 20;
const QUESTION_FIELDS = "id,lei_id,slug,ordem,titulo,assunto,legislacao,pergunta,resposta,justificativa,ativo,updated_at";

export class AdminArticleConflictError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export type ArticleConflictFilters = {
  law?: string;
  ordem?: string;
  titulo?: string;
  assunto?: string;
  status?: string;
  q?: string;
  page?: number;
};

type CommentSummary = { id: number; status: string; precisa_revisao: boolean; source_signature: string | null };

async function requireAdmin() {
  const user = await obterAdministrador();
  if (!user) throw new AdminArticleConflictError(401, "Autenticação administrativa obrigatória.");
  return user;
}

function safeFilter(value: unknown, max = 120) {
  return typeof value === "string" ? value.trim().slice(0, max).toLocaleLowerCase("pt-BR") : "";
}

async function loadQuestions(activeOnly: boolean, pair?: { slug: string; ordem: string }) {
  const db = getSupabaseServerClient();
  const rows: LegisBotConflictQuestion[] = [];
  for (let from = 0; ; from += 1000) {
    let request = db.from("questions").select(QUESTION_FIELDS).order("id").range(from, from + 999);
    if (activeOnly) request = request.eq("ativo", true);
    if (pair) request = request.eq("slug", pair.slug.toLowerCase()).eq("ordem", pair.ordem);
    const result = await request;
    if (result.error) throw new AdminArticleConflictError(503, "Não foi possível consultar os flashcards.");
    const page = (result.data ?? []) as LegisBotConflictQuestion[];
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return rows;
}

async function lawMap() {
  const result = await getSupabaseServerClient().from("leis").select("id,slug,titulo,codigo");
  if (result.error) throw new AdminArticleConflictError(503, "Não foi possível consultar as leis.");
  return new Map((result.data ?? []).map((law) => [String(law.slug).toUpperCase(), {
    id: Number(law.id), title: String(law.titulo), code: law.codigo ? String(law.codigo) : null,
  }]));
}

async function commentsFor(groups: LegisBotConflictGroup[]) {
  const result = await getSupabaseServerClient()
    .from("legisbot_comentarios")
    .select("*");
  if (result.error) throw new AdminArticleConflictError(503, "Não foi possível consultar os comentários do LegisBot.");
  const wanted = new Set(groups.map((group) => group.key));
  return new Map((result.data ?? []).flatMap((row) => {
    const key = `${String(row.slug).toUpperCase()}\u0000${String(row.ordem)}`;
    return wanted.has(key) ? [[key, {
      id: Number(row.id), status: String(row.status), precisa_revisao: row.precisa_revisao === true,
      source_signature: row.source_signature ? String(row.source_signature) : null,
    } satisfies CommentSummary] as const] : [];
  }));
}

export async function listArticleSourceConflicts(filters: ArticleConflictFilters = {}) {
  await requireAdmin();
  const groups = groupLegisBotSourceConflicts(await loadQuestions(true));
  const [laws, comments] = await Promise.all([lawMap(), commentsFor(groups)]);
  const law = safeFilter(filters.law);
  const ordem = safeFilter(filters.ordem, 30);
  const titulo = safeFilter(filters.titulo);
  const assunto = safeFilter(filters.assunto);
  const q = safeFilter(filters.q, 200);
  const status = safeFilter(filters.status, 40);
  const filtered = groups.filter((group) => {
    const metadata = laws.get(group.slug);
    const comment = comments.get(group.key);
    const titles = group.questions.map((item) => item.titulo ?? "").join(" ").toLocaleLowerCase("pt-BR");
    const subjects = group.questions.map((item) => item.assunto ?? "").join(" ").toLocaleLowerCase("pt-BR");
    const haystack = [group.slug, group.ordem, metadata?.title ?? "", metadata?.code ?? "", titles, subjects,
      ...group.questions.map((item) => legalHtmlToStructuredText(item.legislacao ?? ""))].join(" ").toLocaleLowerCase("pt-BR");
    if (law && !`${group.slug} ${metadata?.title ?? ""} ${metadata?.code ?? ""}`.toLocaleLowerCase("pt-BR").includes(law)) return false;
    if (ordem && !group.ordem.toLocaleLowerCase("pt-BR").includes(ordem)) return false;
    if (titulo && !titles.includes(titulo)) return false;
    if (assunto && !subjects.includes(assunto)) return false;
    if (q && !haystack.includes(q)) return false;
    if (status === "com_comentario" && !comment) return false;
    if (status === "sem_comentario" && comment) return false;
    if (status === "precisa_revisao" && !comment?.precisa_revisao) return false;
    if (["pendente", "processando", "concluido", "erro"].includes(status) && comment?.status !== status) return false;
    return true;
  });
  const requestedPage = Number(filters.page);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Number.isSafeInteger(requestedPage) ? requestedPage : 1));
  const start = (page - 1) * PAGE_SIZE;
  const items = filtered.slice(start, start + PAGE_SIZE).map((group) => {
    const metadata = laws.get(group.slug);
    const comment = comments.get(group.key);
    return {
      slug: group.slug,
      ordem: group.ordem,
      lawTitle: metadata?.title ?? group.questions[0]?.titulo ?? group.slug,
      lawCode: metadata?.code ?? null,
      titulo: group.questions.find((item) => item.titulo?.trim())?.titulo ?? null,
      assunto: group.questions.find((item) => item.assunto?.trim())?.assunto ?? null,
      flashcards: group.questions.length,
      versions: group.versions.size,
      comment,
    };
  });
  return {
    items,
    page,
    pages,
    total: filtered.length,
    indicators: {
      pending: groups.length,
      laws: new Set(groups.map((group) => group.slug)).size,
      flashcards: groups.reduce((sum, group) => sum + group.questions.length, 0),
    },
  };
}

export async function getArticleSourceConflict(rawSlug: string, rawOrdem: string) {
  await requireAdmin();
  const identifiers = normalizeLegisBotIdentifiers(rawSlug, rawOrdem);
  const all = await loadQuestions(false, identifiers);
  const activeConflict = groupLegisBotSourceConflicts(all);
  const conflict = activeConflict.find((item) => item.slug === identifiers.slug && item.ordem === identifiers.ordem);
  if (!conflict) return null;
  const [laws, comments, allConflicts] = await Promise.all([
    lawMap(), commentsFor([conflict]), loadQuestions(true).then(groupLegisBotSourceConflicts),
  ]);
  const activeVersions = [...conflict.versions.entries()];
  const versions = activeVersions.map(([id, activeQuestions], index) => {
    const representative = activeQuestions[0];
    const questions = all.filter((question) => legislationVersionId(question.legislacao) === id);
    const reference = activeVersions.find((_, otherIndex) => otherIndex !== index)?.[1][0]?.legislacao ?? null;
    return {
      id,
      sanitizedHtml: sanitizeLegalHtmlCore(representative.legislacao ?? ""),
      differences: compareLegislationText(representative.legislacao, reference),
      activeCount: activeQuestions.length,
      questions: questions.map((question) => ({
        ...question,
        editorUrl: `/admin/leis/${encodeURIComponent(question.slug.toLowerCase())}/questoes?question_id=${encodeURIComponent(question.id)}&retorno=${encodeURIComponent(`/admin/artigos/conflitos/${identifiers.slug.toLowerCase()}/${identifiers.ordem}`)}`,
      })),
    };
  });
  const position = allConflicts.findIndex((item) => item.key === conflict.key);
  const next = position >= 0 && allConflicts.length > 1 ? allConflicts[(position + 1) % allConflicts.length] : null;
  const metadata = laws.get(conflict.slug);
  return {
    slug: conflict.slug,
    ordem: conflict.ordem,
    lawId: metadata?.id ?? conflict.questions[0].lei_id,
    lawTitle: metadata?.title ?? conflict.questions[0].titulo ?? conflict.slug,
    lawCode: metadata?.code ?? null,
    flashcards: conflict.questions.length,
    versions,
    comment: comments.get(conflict.key) ?? null,
    next: next ? { slug: next.slug, ordem: next.ordem } : null,
  };
}

export async function previewArticleSourceStandardization(rawSlug: string, rawOrdem: string, versionId: string) {
  await requireAdmin();
  if (!/^[0-9a-f]{64}$/.test(versionId)) throw new AdminArticleConflictError(400, "Versão de legislação inválida.");
  const identifiers = normalizeLegisBotIdentifiers(rawSlug, rawOrdem);
  const rows = (await loadQuestions(true, identifiers)).sort((a, b) => a.id.localeCompare(b.id));
  const selected = rows.find((row) => legislationVersionId(row.legislacao) === versionId);
  if (!selected) throw new AdminArticleConflictError(409, "A versão escolhida não está mais disponível. Recarregue o conflito.");
  const expected = rows.map((row) => ({ id: row.id, before: row.legislacao }));
  const affectedIds = rows.filter((row) => row.legislacao !== selected.legislacao).map((row) => row.id);
  return {
    slug: identifiers.slug,
    ordem: identifiers.ordem,
    versionId,
    value: selected.legislacao ?? "",
    questionIds: rows.map((row) => row.id),
    affectedIds,
    expected,
    count: affectedIds.length,
  };
}

export async function applyArticleSourceStandardization(input: { slug: string; ordem: string; versionId: string; expected: unknown; confirmation: string }) {
  if (input.confirmation !== "PADRONIZAR") throw new AdminArticleConflictError(422, "Digite PADRONIZAR para confirmar.");
  const preview = await previewArticleSourceStandardization(input.slug, input.ordem, input.versionId);
  if (!Array.isArray(input.expected) || JSON.stringify(input.expected) !== JSON.stringify(preview.expected)) {
    throw new AdminArticleConflictError(409, "Os flashcards mudaram desde a confirmação. Gere uma nova prévia.");
  }
  const result = await applyBulkQuestionEdit({
    law_slug: preview.slug.toLowerCase(), scope: "selected", field: "legislacao", value: preview.value,
    question_ids: preview.questionIds, expected: preview.expected,
  });
  const selected = (await loadQuestions(true, { slug: preview.slug, ordem: preview.ordem })).find((row) => legislationVersionId(row.legislacao) === preview.versionId);
  if (selected) await markCommentForReviewWhenNeeded(selected);
  return { result, resolved: (await getArticleSourceConflict(preview.slug, preview.ordem)) === null };
}

async function markCommentForReviewWhenNeeded(source: LegisBotConflictQuestion) {
  const db = getSupabaseServerClient();
  const current = await db.from("legisbot_comentarios").select("id,titulo,assunto,legislacao,source_signature,precisa_revisao").eq("slug", source.slug.toUpperCase()).eq("ordem", source.ordem).maybeSingle();
  if (current.error || !current.data) return;
  const nextSignature = createLegisBotSourceSignature({
    titulo: source.titulo?.trim() ?? "", assunto: source.assunto?.trim() ?? "",
    promptLegislacao: legalHtmlToStructuredText(source.legislacao ?? ""),
  });
  const storedSignature = current.data.source_signature ? String(current.data.source_signature) : createLegisBotSourceSignature({
    titulo: String(current.data.titulo ?? ""), assunto: String(current.data.assunto ?? ""),
    promptLegislacao: legalHtmlToStructuredText(String(current.data.legislacao ?? "")),
  });
  if (storedSignature === nextSignature || current.data.precisa_revisao === true) return;
  const updated = await db.from("legisbot_comentarios").update({ precisa_revisao: true }).eq("id", current.data.id);
  if (updated.error) throw new AdminArticleConflictError(503, "Os flashcards foram corrigidos, mas não foi possível sinalizar a revisão do comentário.");
}

export async function deactivateArticleConflictQuestion(rawSlug: string, rawOrdem: string, questionId: string, confirmation: string) {
  await requireAdmin();
  if (confirmation !== "INATIVAR") throw new AdminArticleConflictError(422, "Digite INATIVAR para confirmar.");
  const identifiers = normalizeLegisBotIdentifiers(rawSlug, rawOrdem);
  const rows = await loadQuestions(true, identifiers);
  const selected = rows.find((row) => row.id === questionId);
  if (!selected) throw new AdminArticleConflictError(404, "Flashcard ativo não encontrado neste conflito.");
  await deactivateAdminQuestion({ law_slug: identifiers.slug.toLowerCase(), id: selected.id });
  const remaining = await loadQuestions(true, identifiers);
  if (remaining.length && new Set(remaining.map((row) => legislationVersionId(row.legislacao))).size === 1) await markCommentForReviewWhenNeeded(remaining[0]);
  return { id: selected.id, resolved: (await getArticleSourceConflict(identifiers.slug, identifiers.ordem)) === null };
}
