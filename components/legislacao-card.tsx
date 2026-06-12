import type { Legislacao } from "@/lib/legislacoes";

export function LegislacaoCard({ legislacao }: { legislacao: Legislacao }) {
  return (
    <article className="flex h-full flex-col justify-between rounded border border-slate-200 bg-white p-5 shadow-sm">
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
          {legislacao.categoria}
        </p>
        <div className="space-y-2">
          <h3 className="text-xl font-bold text-slate-950">
            {legislacao.nome}
          </h3>
          <p className="text-sm leading-6 text-slate-600">
            {legislacao.descricaoCurta}
          </p>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between gap-4 border-t border-slate-100 pt-4">
        <span className="text-sm font-semibold text-slate-800">
          {legislacao.quantidadeFlashcards} flashcards
        </span>
        <a
          href={`/leisflashcards/${legislacao.slug}`}
          className="text-sm font-semibold text-blue-700 hover:text-blue-900"
        >
          Ver detalhes
        </a>
      </div>
    </article>
  );
}
