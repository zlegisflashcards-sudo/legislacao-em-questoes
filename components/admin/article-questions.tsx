"use client";

import Link from "next/link";
import type { StandardizableQuestion } from "@/components/admin/question-standardization-panel";
import { ArticleContextStandardizationTrigger } from "@/components/admin/article-context-standardization-trigger";
import { questionStructureIssues } from "@/lib/question-structure-consistency";

type Question = StandardizableQuestion & { pergunta: string; resposta: string; titulo: string | null; structure_id: number | null };

export function ArticleQuestions({ lawSlug, slug, ordem, questions, legisbotCount, communityCount }: { lawSlug: string; slug: string; ordem: string; questions: Question[]; legisbotCount: number; communityCount: number }) {
  const distinctSubjects = new Set(questions.map((item) => item.assunto?.trim() || "")).size > 1;
  const distinctLegislation = new Set(questions.map((item) => item.legislacao?.trim() || "")).size > 1;
  return <>{(distinctSubjects || distinctLegislation) ? <p className="article-issue">{distinctSubjects ? "Assuntos diferentes no grupo" : ""}{distinctSubjects && distinctLegislation ? " · " : ""}{distinctLegislation ? "Legislações diferentes no grupo" : ""}</p> : null}<div className="article-bulk-bar"><span>{questions.length} questão(ões) no contexto</span><ArticleContextStandardizationTrigger lawSlug={lawSlug} slug={slug} ordem={ordem} questions={questions} legisbotCount={legisbotCount} communityCount={communityCount} /></div><div className="article-question-list">{questions.map((item) => { const issues = questionStructureIssues(item, { slug, ordem }); return <article className="article-result" key={item.id}><div><strong>{item.resposta}</strong><p>{item.pergunta.replace(/<[^>]+>/g, " ").slice(0, 240)}</p><small>{item.assunto ?? "Sem assunto"} · ordem {item.ordem} · estrutura {item.structure_id ?? "—"}</small>{issues.length ? <p className="article-issue" title={issues.map((issue) => issue.label).join("; ")}>{issues[0].certainty === "possible" ? "Possível inconsistência" : issues[0].label}{issues.length > 1 ? ` +${issues.length - 1}` : ""}</p> : null}</div><Link className="admin-button secondary" href={`/admin/leis/${encodeURIComponent(item.slug.toLowerCase())}/questoes?question_id=${encodeURIComponent(item.id)}`}>Editar questão</Link></article>; })}</div></>;
}
