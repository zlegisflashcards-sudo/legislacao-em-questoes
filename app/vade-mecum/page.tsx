import { LegislacaoCard } from "@/components/legislacao-card";
import {
  categoriasLegislacao,
  filtrarLegislacoesPorCategoria,
  getLegislacoes,
} from "@/lib/legislacoes";

export default async function VadeMecumPage() {
  const legislacoes = await getLegislacoes();

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-10 px-5 py-10 sm:px-6 sm:py-14">
      <div className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
          Vade Mecum
        </p>
        <h1 className="text-4xl font-bold leading-tight text-slate-950 sm:text-5xl">
          Catálogo completo de legislações
        </h1>
        <p className="max-w-2xl text-lg leading-8 text-slate-700">
          Consulte as legislações disponíveis para estudo, organizadas por
          categoria.
        </p>
      </div>

      {categoriasLegislacao.map((categoria) => {
        const legislacoesDaCategoria = filtrarLegislacoesPorCategoria(
          legislacoes,
          categoria.nome,
        );

        return (
          <section key={categoria.slug} className="space-y-5">
            <div className="space-y-1">
              <h2 className="text-2xl font-bold text-slate-950">
                {categoria.nome}
              </h2>
              <p className="text-sm leading-6 text-slate-600">
                {categoria.descricao}
              </p>
            </div>

            {legislacoesDaCategoria.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-3">
                {legislacoesDaCategoria.map((legislacao) => (
                  <LegislacaoCard
                    key={legislacao.slug}
                    legislacao={legislacao}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
                Ainda não há legislações ativas nesta categoria.
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
