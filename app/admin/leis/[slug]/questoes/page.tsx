import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminLawQuestions } from "@/components/admin/admin-law-questions";
import type { AdminQuestionStructureNode } from "@/components/admin/admin-question-editor";
import { getAdminLawBySlug, getAdminLawStructure } from "@/lib/admin-law-center-server";
import { getAdminQuestion, getLegisBotQuestionDraft } from "@/lib/admin-questoes-server";

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
  const initialDraft = !initialQuestion && legisBotId ? (await getLegisBotQuestionDraft(law.slug, legisBotId)).data : null;
  const requestedReturn = one(query.retorno);
  const returnHref = requestedReturn.startsWith("/admin/artigos/conflitos/") && !requestedReturn.startsWith("//") ? requestedReturn : "";
  return <div data-law-area="questoes"><AdminLawQuestions law={{ id: law.id, slug: law.slug, titulo: law.titulo }} initialStructure={structure as AdminQuestionStructureNode[]} initialQuestion={initialQuestion} initialDraft={initialDraft} sourceLegisBotId={legisBotId ? Number(legisBotId) : null} returnHref={returnHref} /></div>;
}
