import { notFound } from "next/navigation";
import { LegislacaoCard } from "@/components/legislacao-card";
import {
  categoriasLegislacao,
  filtrarLegislacoesPorCategoria,
  getCategoriaPorSlug,
  getLegislacoes,
} from "@/lib/legislacoes";

type CategoriaPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export function generateStaticParams() {
  return categoriasLegislacao.map((categoria) => ({
    slug: categoria.slug,
  }));
}

export default async function CategoriaPage({ params }: CategoriaPageProps) {
  const { slug } = await params;
  const categoria = getCategoriaPorSlug(slug);

  if (!categoria) {
    notFound();
  }

  const legislacoes = await getLegislacoes();
  const legislacoesDaCategoria = filtrarLegislacoesPorCategoria(
    legislacoes,
    categoria.nome,
  );

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-10 sm:px-6 sm:py-14">
      <div className="space-y-4">
        <a
          href="/"
          className="text-sm font-semibold text-blue-700 hover:text-blue-900"
        >
          Voltar para a Home
        </a>
        <div className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
            Categoria
          </p>
          <h1 className="text-4xl font-bold leading-tight text-slate-950 sm:text-5xl">
            {categoria.nome}
          </h1>
          <p className="max-w-2xl text-lg leading-8 text-slate-700">
            {categoria.descricao}
          </p>
        </div>
      </div>

      {legislacoesDaCategoria.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-3">
          {legislacoesDaCategoria.map((legislacao) => (
            <LegislacaoCard key={legislacao.slug} legislacao={legislacao} />
          ))}
        </div>
      ) : (
        <div className="rounded border border-slate-200 bg-white p-6 text-slate-700 shadow-sm">
          Ainda não há legislações ativas nesta categoria.
        </div>
      )}
    </div>
  );
}
