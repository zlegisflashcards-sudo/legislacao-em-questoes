import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminLawQuestions } from "@/components/admin/admin-law-questions";
import type { AdminQuestionStructureNode } from "@/components/admin/admin-question-editor";
import { getAdminLawBySlug, getAdminLawStructure } from "@/lib/admin-law-center-server";
import { getAdminQuestion, getLegisBotQuestionDraft } from "@/lib/admin-questoes-server";
import type { QuestionDraft } from "@/lib/admin-questoes";

const one = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] ?? "" : value ?? "";

export default async function AdminLawQuestionsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const law = await getAdminLawBySlug(slug);
  if (!law) notFound();
  if (!law.ativo) return <article className="commercial-card law-center-empty" data-law-area="questoes"><h2>Questões</h2><p>Esta lei está inativa. Ative-a em Dados da lei antes de gerenciar suas questões.</p><Link className="admin-button primary" href={`/admin/leis/${encodeURIComponent(law.slug)}/dados`}>Abrir Dados da lei</Link></article>;
  const structure = await getAdminLawStructure(law.id);
  const questionId = one(query.question_id);
  const initialQuestion = questionId ? (await getAdminQuestion(law.slug, questionId)).question : null;
  const legisBotId = one(query.legisbot_id);
  const contextQuestionId = one(query.contexto_id);
  const contextQuestion = !initialQuestion && !legisBotId && contextQuestionId ? (await getAdminQuestion(law.slug, contextQuestionId)).question : null;
  const contextDraft: QuestionDraft | null = contextQuestion ? {
    structure_id: contextQuestion.structure_id,
    pergunta: "",
    resposta: "Certo",
    justificativa: "",
    assunto: contextQuestion.assunto,
    legislacao: contextQuestion.legislacao,
    ordem: contextQuestion.ordem,
    titulo: contextQuestion.titulo,
    total_artigos: contextQuestion.total_artigos,
    capitulo: contextQuestion.capitulo,
    secao: contextQuestion.secao,
    subsecao: contextQuestion.subsecao,
    artigo: contextQuestion.artigo,
  } : null;
  const initialDraft = !initialQuestion && legisBotId ? (await getLegisBotQuestionDraft(law.slug, legisBotId)).data : contextDraft;
  const requestedReturn = one(query.retorno);
  const returnHref = requestedReturn.startsWith("/admin/artigos/") && !requestedReturn.startsWith("//") ? requestedReturn : "";
  return <div data-law-area="questoes"><AdminLawQuestions law={{ id: law.id, slug: law.slug, titulo: law.titulo }} initialStructure={structure as AdminQuestionStructureNode[]} initialQuestion={initialQuestion} initialDraft={initialDraft} sourceLegisBotId={legisBotId ? Number(legisBotId) : null} returnHref={returnHref} /></div>;
}
