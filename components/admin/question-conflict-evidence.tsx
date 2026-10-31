import type { questionConflictProvenance } from "@/lib/question-conflict-provenance";
type Evidence = ReturnType<typeof questionConflictProvenance>["affected"];
export function QuestionConflictEvidence({ questions, total }: { questions: Evidence; total: number }) {
  if (!questions.length) return null;
  return <section className="mt-3 grid gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950" aria-label="Diagnóstico estrutural por questão">
    <h3 className="font-black">Entenda o conflito — {questions.length} de {total} questões com indicação estrutural</h3>
    <p>Assunto, Ordem, Estrutura e indicação abaixo pertencem ao mesmo UUID. A indicação exige conferência; não determina sozinha qual campo deve ser corrigido.</p>
    {questions.length < total ? <p>As demais {total - questions.length} questões não têm indicação estrutural neste diagnóstico e não entram na correção de Ordem em lote.</p> : null}
    {questions.map((question) => <article key={question.id} className="grid gap-2 rounded-lg border border-amber-200 bg-white p-3">
      <p className="break-all"><strong>UUID:</strong> <code>{question.id}</code></p>
      <p><strong>{question.validation.status === "conflict" ? "Conflito estrutural" : "Possível conflito estrutural"}:</strong> {question.validation.message?.replace(/^(Conflito estrutural|Possível conflito):\s*/, "") ?? "Confira Assunto e Ordem."}</p>
      <dl className="grid gap-1 text-slate-700">
        <div><dt className="font-bold">Assunto cadastrado</dt><dd>{question.assunto || "Não informado"}</dd></div>
        <div><dt className="font-bold">Ordem atual</dt><dd><code>{question.ordem}</code></dd></div>
        <div><dt className="font-bold">Estrutura vinculada (ID)</dt><dd>{question.structureId ?? "Sem vínculo"}</dd></div>
        {question.validation.expectedOrder ? <div><dt className="font-bold">Ordem indicada pelo Assunto</dt><dd><code>{question.validation.expectedOrder}</code></dd></div> : null}
      </dl>
      {question.validation.differences?.length ? <p><strong>Diferença identificada:</strong> {question.validation.differences.join("; ")}.</p> : null}
      <a className="admin-link-button" href={question.editorUrl}>Revisar questão <span className="sr-only">{question.id}</span></a>
    </article>)}
  </section>;
}
