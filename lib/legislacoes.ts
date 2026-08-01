import { fetchLegislacoesFromGoogleSheets } from "@/lib/google-sheets";

export type CategoriaLegislacao =
  | "Constituição Federal"
  | "Códigos"
  | "Legislações"
  | "Tratados"
  | "Legislações Específicas";

export type CategoriaCatalogo = "leis" | "vade_mecuns";

export type SimNao = "Sim" | "Não";

export type StatusAtualizacao =
  | "Atualizado"
  | "Em produção"
  | "Em atualização"
  | "Indisponível";

export type Legislacao = {
  slug: string;
  nome: string;
  tituloCompleto?: string;
  numeroLei?: string;
  sigla?: string;
  termosRelacionados?: string;
  thumbnailUrl?: string;
  descricaoCurta: string;
  categoria: CategoriaLegislacao;
  categoriaCatalogo: CategoriaCatalogo;
  unidade: string;
  destaqueHome: SimNao;
  destaqueLegiscast: boolean;
  ativo: SimNao;
  youtubeUrl: string;
  quantidadeFlashcards: number;
  pdfEsquematizadoUrl?: string;
  legiscastUrl?: string;
  hotmartUrl: string;
  ultimaAlteracaoLegislativa: string;
  statusAtualizacao: StatusAtualizacao;
  incluirNoCombo: boolean;
  ordemCombo?: number;
};

const vadeMecumSemHotmartAvisados = new Set<string>();

export function isVadeMecum(legislacao: Legislacao) {
  return legislacao.categoriaCatalogo === "vade_mecuns";
}

export function getVadeMecumHotmartUrl(legislacao: Legislacao) {
  if (!isVadeMecum(legislacao)) {
    return null;
  }

  const hotmartUrl = legislacao.hotmartUrl?.trim();

  if (
    !hotmartUrl &&
    process.env.NODE_ENV === "development" &&
    !vadeMecumSemHotmartAvisados.has(legislacao.slug)
  ) {
    vadeMecumSemHotmartAvisados.add(legislacao.slug);
    console.warn(
      `[Legis Flashcards] Produto da seção "Por concurso" sem hotmartUrl: ${legislacao.slug}`,
    );
  }

  return hotmartUrl || null;
}

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
  {
    slug: "tratados",
    nome: "Tratados",
    descricao: "Tratados e documentos internacionais relevantes para provas.",
  },
  {
    slug: "legislacoes-especificas",
    nome: "Legislações Específicas",
    descricao: "Normas específicas organizadas para concursos direcionados.",
  },
];

const legislacoesFallback: Legislacao[] = [
  {
    slug: "constituicao-federal",
    nome: "Constituição Federal",
    descricaoCurta:
      "Principais dispositivos constitucionais cobrados em provas e revisões.",
    categoria: "Constituição Federal",
    categoriaCatalogo: "leis",
    unidade: "Flashcards",
    destaqueHome: "Sim",
    destaqueLegiscast: true,
    ativo: "Sim",
    youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    quantidadeFlashcards: 420,
    pdfEsquematizadoUrl: "https://example.com/constituicao-federal.pdf",
    legiscastUrl: "https://example.com/legiscast/constituicao-federal",
    hotmartUrl: "https://pay.hotmart.com/example-constituicao",
    ultimaAlteracaoLegislativa: "Em acompanhamento",
    statusAtualizacao: "Atualizado",
    incluirNoCombo: true,
    ordemCombo: 1,
  },
  {
    slug: "codigo-penal",
    nome: "Código Penal",
    descricaoCurta:
      "Flashcards organizados sobre a parte geral e principais crimes.",
    categoria: "Códigos",
    categoriaCatalogo: "leis",
    unidade: "Flashcards",
    destaqueHome: "Sim",
    destaqueLegiscast: true,
    ativo: "Sim",
    youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    quantidadeFlashcards: 360,
    pdfEsquematizadoUrl: "https://example.com/codigo-penal.pdf",
    hotmartUrl: "https://pay.hotmart.com/example-codigo-penal",
    ultimaAlteracaoLegislativa: "Em acompanhamento",
    statusAtualizacao: "Atualizado",
    incluirNoCombo: true,
    ordemCombo: 2,
  },
  {
    slug: "vade-mecum-carreiras-policiais",
    nome: "Vade Mecum Carreiras Policiais",
    descricaoCurta:
      "Conjunto de legislações organizado para carreiras policiais.",
    categoria: "Legislações",
    categoriaCatalogo: "vade_mecuns",
    unidade: "Legislações",
    destaqueHome: "Sim",
    destaqueLegiscast: false,
    ativo: "Sim",
    youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    quantidadeFlashcards: 85,
    hotmartUrl: "https://pay.hotmart.com/example-vade-mecum",
    ultimaAlteracaoLegislativa: "Em acompanhamento",
    statusAtualizacao: "Atualizado",
    incluirNoCombo: false,
  },
  {
    slug: "legislacao-inativa-exemplo",
    nome: "Legislação Inativa de Exemplo",
    descricaoCurta:
      "Este item existe apenas para testar a regra de ativo igual a Não.",
    categoria: "Legislações",
    categoriaCatalogo: "leis",
    unidade: "Flashcards",
    destaqueHome: "Sim",
    destaqueLegiscast: false,
    ativo: "Não",
    youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    quantidadeFlashcards: 0,
    hotmartUrl: "https://pay.hotmart.com/example-inativo",
    incluirNoCombo: false,
    statusAtualizacao: "Indisponível",
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

export function filtrarLegislacoesDoCombo(legislacoes: Legislacao[]) {
  return filtrarLegislacoesAtivas(legislacoes)
    .filter((legislacao) => legislacao.incluirNoCombo)
    .sort((legislacaoA, legislacaoB) => {
      const ordemA = legislacaoA.ordemCombo ?? Number.MAX_SAFE_INTEGER;
      const ordemB = legislacaoB.ordemCombo ?? Number.MAX_SAFE_INTEGER;

      if (ordemA !== ordemB) {
        return ordemA - ordemB;
      }

      return legislacaoA.nome.localeCompare(legislacaoB.nome, "pt-BR");
    });
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
  const trimmedUrl = youtubeUrl.trim();

  if (!trimmedUrl) return "";

  try {
    const url = new URL(trimmedUrl);
    const hostname = url.hostname.replace(/^www\./, "").toLowerCase();
    const isYoutube =
      hostname === "youtube.com" || hostname.endsWith(".youtube.com");
    const isYoutubeShortUrl = hostname === "youtu.be";

    const playlistId = url.searchParams.get("list");
    if (playlistId && (isYoutube || isYoutubeShortUrl)) {
      return `https://www.youtube.com/embed/videoseries?list=${encodeURIComponent(playlistId)}`;
    }

    if (isYoutube && url.pathname === "/watch") {
      const videoId = url.searchParams.get("v");
      if (videoId) {
        return `https://www.youtube.com/embed/${encodeURIComponent(videoId)}`;
      }
    }

    if (isYoutubeShortUrl) {
      const videoId = url.pathname.split("/").filter(Boolean)[0];
      if (videoId) {
        return `https://www.youtube.com/embed/${encodeURIComponent(videoId)}`;
      }
    }

    if (isYoutube && url.pathname.startsWith("/embed/")) {
      return trimmedUrl;
    }

    return trimmedUrl;
  } catch {
    return trimmedUrl;
  }
}
