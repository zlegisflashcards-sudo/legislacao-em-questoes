import { fetchLegislacoesFromGoogleSheets } from "@/lib/google-sheets";

export type CategoriaLegislacao =
  | "Constituição Federal"
  | "Códigos"
  | "Legislações";

export type SimNao = "Sim" | "Não";

export type Legislacao = {
  slug: string;
  nome: string;
  descricaoCurta: string;
  categoria: CategoriaLegislacao;
  destaqueHome: SimNao;
  ativo: SimNao;
  youtubeUrl: string;
  quantidadeFlashcards: number;
  pdfEsquematizadoUrl?: string;
  legiscastUrl?: string;
  hotmartUrl: string;
  ultimaAlteracaoLegislativa: string;
};

export const categoriasLegislacao: Array<{
  slug: string;
  nome: CategoriaLegislacao;
  descricao: string;
}> = [
  {
    slug: "constituicao-federal",
    nome: "Constituição Federal",
    descricao: "Destaques para estudo da Constituição Federal.",
  },
  {
    slug: "codigos",
    nome: "Códigos",
    descricao: "Códigos organizados para revisão por flashcards.",
  },
  {
    slug: "legislacoes",
    nome: "Legislações",
    descricao: "Leis especiais e normas relevantes para concursos.",
  },
];

const legislacoesFallback: Legislacao[] = [
  {
    slug: "constituicao-federal",
    nome: "Constituição Federal",
    descricaoCurta:
      "Principais dispositivos constitucionais cobrados em provas e revisões.",
    categoria: "Constituição Federal",
    destaqueHome: "Sim",
    ativo: "Sim",
    youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    quantidadeFlashcards: 420,
    pdfEsquematizadoUrl: "https://example.com/constituicao-federal.pdf",
    legiscastUrl: "https://example.com/legiscast/constituicao-federal",
    hotmartUrl: "https://pay.hotmart.com/example-constituicao",
    ultimaAlteracaoLegislativa: "Em acompanhamento",
  },
  {
    slug: "codigo-penal",
    nome: "Código Penal",
    descricaoCurta:
      "Flashcards organizados sobre a parte geral e principais crimes.",
    categoria: "Códigos",
    destaqueHome: "Sim",
    ativo: "Sim",
    youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    quantidadeFlashcards: 360,
    pdfEsquematizadoUrl: "https://example.com/codigo-penal.pdf",
    hotmartUrl: "https://pay.hotmart.com/example-codigo-penal",
    ultimaAlteracaoLegislativa: "Em acompanhamento",
  },
  {
    slug: "lei-de-improbidade-administrativa",
    nome: "Lei de Improbidade Administrativa",
    descricaoCurta:
      "Material focado nos pontos mais recorrentes da Lei 8.429/1992.",
    categoria: "Legislações",
    destaqueHome: "Sim",
    ativo: "Sim",
    youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    quantidadeFlashcards: 180,
    legiscastUrl: "https://example.com/legiscast/improbidade-administrativa",
    hotmartUrl: "https://pay.hotmart.com/example-improbidade",
    ultimaAlteracaoLegislativa: "Em acompanhamento",
  },
  {
    slug: "legislacao-inativa-exemplo",
    nome: "Legislação Inativa de Exemplo",
    descricaoCurta:
      "Este item existe apenas para testar a regra de ativo igual a Não.",
    categoria: "Legislações",
    destaqueHome: "Sim",
    ativo: "Não",
    youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    quantidadeFlashcards: 0,
    hotmartUrl: "https://pay.hotmart.com/example-inativo",
    ultimaAlteracaoLegislativa: "Não publicada",
  },
];

export async function getLegislacoes() {
  const csvUrl = process.env.GOOGLE_SHEETS_CSV_URL;

  if (!csvUrl) {
    return legislacoesFallback;
  }

  try {
    return await fetchLegislacoesFromGoogleSheets(csvUrl);
  } catch {
    return legislacoesFallback;
  }
}

export function filtrarLegislacoesAtivas(legislacoes: Legislacao[]) {
  return legislacoes.filter((legislacao) => legislacao.ativo === "Sim");
}

export function filtrarDestaquesPorCategoria(
  legislacoes: Legislacao[],
  categoria: CategoriaLegislacao,
) {
  return filtrarLegislacoesAtivas(legislacoes).filter(
    (legislacao) =>
      legislacao.categoria === categoria && legislacao.destaqueHome === "Sim",
  );
}

export function getCategoriaPorSlug(slug: string) {
  return categoriasLegislacao.find((categoria) => categoria.slug === slug);
}

export function filtrarLegislacoesPorCategoria(
  legislacoes: Legislacao[],
  categoria: CategoriaLegislacao,
) {
  return filtrarLegislacoesAtivas(legislacoes).filter(
    (legislacao) => legislacao.categoria === categoria,
  );
}

export function encontrarLegislacaoPorSlug(
  legislacoes: Legislacao[],
  slug: string,
) {
  return filtrarLegislacoesAtivas(legislacoes).find(
    (legislacao) => legislacao.slug === slug,
  );
}

export function getYoutubeEmbedUrl(youtubeUrl: string) {
  try {
    const url = new URL(youtubeUrl);

    if (url.hostname.includes("youtu.be")) {
      const videoId = url.pathname.replace("/", "");
      return videoId ? `https://www.youtube.com/embed/${videoId}` : youtubeUrl;
    }

    const videoId = url.searchParams.get("v");
    return videoId ? `https://www.youtube.com/embed/${videoId}` : youtubeUrl;
  } catch {
    return youtubeUrl;
  }
}
