import { LegislacaoCard } from "@/components/legislacao-card";
import { LegislacaoSearch } from "@/components/legislacao-search";
import {
  categoriasLegislacao,
  filtrarDestaquesPorCategoria,
  filtrarLegislacoesAtivas,
  getLegislacoes,
} from "@/lib/legislacoes";

function CategoriaSection({
  categoria,
  legislacoes,
}: {
  categoria: (typeof categoriasLegislacao)[number];
  legislacoes: Awaited<ReturnType<typeof getLegislacoes>>;
}) {
  const destaques = filtrarDestaquesPorCategoria(legislacoes, categoria.nome);

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold text-slate-950">
            {categoria.nome}
          </h2>
          <p className="text-sm leading-6 text-slate-600">
            {categoria.descricao}
          </p>
        </div>
        <a
          href={`/categorias/${categoria.slug}`}
          className="inline-flex w-fit items-center justify-center rounded border border-blue-700 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"
        >
          Ver mais
        </a>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {destaques.map((legislacao) => (
          <LegislacaoCard key={legislacao.slug} legislacao={legislacao} />
        ))}
      </div>
    </section>
  );
}

export default async function Home() {
  const legislacoes = await getLegislacoes();
  const legislacoesAtivas = filtrarLegislacoesAtivas(legislacoes);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-12 px-5 py-10 sm:px-6 sm:py-14">
      <section className="grid gap-8 rounded bg-white p-6 shadow-sm sm:p-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div className="space-y-4">
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
            Catálogo de legislações
          </p>
          <div className="space-y-3">
            <h1 className="max-w-3xl text-4xl font-bold leading-tight text-slate-950 sm:text-5xl">
              Encontre a legislação que você quer revisar
            </h1>
            <p className="max-w-2xl text-lg leading-8 text-slate-700">
              Consulte materiais disponíveis com flashcards, vídeo público,
              PDF Esquematizado, Legiscast e histórico de atualização
              legislativa.
            </p>
          </div>
        </div>

        <LegislacaoSearch legislacoes={legislacoesAtivas} />
      </section>

      {categoriasLegislacao.map((categoria) => (
        <CategoriaSection
          key={categoria.nome}
          categoria={categoria}
          legislacoes={legislacoes}
        />
      ))}
    </div>
  );
}
