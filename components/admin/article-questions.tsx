"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { QuestionStandardizationPanel, type StandardizableQuestion } from "@/components/admin/question-standardization-panel";
import { questionStructureIssues } from "@/lib/question-structure-consistency";

type Question = StandardizableQuestion & { pergunta: string; resposta: string; titulo: string | null; structure_id: number | null };
export function ArticleQuestions({ lawSlug, slug, ordem, questions }: { lawSlug: string; slug: string; ordem: string; questions: Question[] }) {
  const router = useRouter(); const [selected, setSelected] = useState<string[]>([]); const [open, setOpen] = useState(false);
  const distinctSubjects = new Set(questions.map((item) => item.assunto?.trim() || "")).size > 1;
  const distinctLegislation = new Set(questions.map((item) => item.legislacao?.trim() || "")).size > 1;
  const toggle = (id: string) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const all = questions.length > 0 && questions.every((item) => selected.includes(item.id));
  return <>{(distinctSubjects || distinctLegislation) ? <p className="article-issue">{distinctSubjects ? "Assuntos diferentes no grupo" : ""}{distinctSubjects && distinctLegislation ? " · " : ""}{distinctLegislation ? "Legislações diferentes no grupo" : ""}</p> : null}{selected.length ? <div className="article-bulk-bar"><span>{selected.length} selecionada(s)</span><button type="button" className="admin-button primary" onClick={() => setOpen(true)}>Padronizar questões</button></div> : null}<div className="article-question-list"><div className="article-question-select-all"><button type="button" className="admin-button secondary" onClick={() => setSelected(all ? [] : questions.map((item) => item.id))}>{all ? "Desmarcar todas" : "Selecionar todas"}</button></div>{questions.map((item) => { const issues = questionStructureIssues(item, { slug, ordem }); return <article className="article-result" key={item.id}><label><input type="checkbox" checked={selected.includes(item.id)} onChange={() => toggle(item.id)} aria-label={`Selecionar questão ${item.id}`} /></label><div><strong>{item.resposta}</strong><p>{item.pergunta.replace(/<[^>]+>/g, " ").slice(0, 240)}</p><small>{item.assunto ?? "Sem assunto"} · ordem {item.ordem} · estrutura {item.structure_id ?? "—"}</small>{issues.length ? <p className="article-issue" title={issues.map((issue) => issue.label).join("; ")}>{issues[0].certainty === "possible" ? "Possível inconsistência" : issues[0].label}{issues.length > 1 ? ` +${issues.length - 1}` : ""}</p> : null}</div><Link className="admin-button secondary" href={`/admin/leis/${encodeURIComponent(item.slug.toLowerCase())}/questoes?question_id=${encodeURIComponent(item.id)}`}>Editar</Link></article>; })}</div>{open ? <QuestionStandardizationPanel lawSlug={lawSlug} slug={slug} ordem={ordem} questions={questions} selectedIds={selected} onClose={() => setOpen(false)} onSuccess={() => { setOpen(false); setSelected([]); router.refresh(); }} /> : null}</>;
}
