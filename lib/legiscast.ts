import type { Legislacao } from "@/lib/legislacoes";

export type LegiscastItem = {
  slug: string;
  titulo: string;
  nome: string;
  numeroLei?: string;
  sigla?: string;
  descricao?: string;
  termosRelacionados?: string;
  thumbnailUrl?: string;
  destaqueLegiscast: boolean;
};

const SLUG_VALIDO = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;

export function criarItemLegiscast(
  legislacao: Legislacao,
): LegiscastItem | null {
  const slug = legislacao.slug.trim();

  if (
    legislacao.ativo !== "Sim" ||
    legislacao.categoriaCatalogo !== "leis" ||
    !SLUG_VALIDO.test(slug)
  ) {
    return null;
  }

  return {
    slug,
    titulo: legislacao.tituloCompleto?.trim() || legislacao.nome,
    nome: legislacao.nome,
    numeroLei: legislacao.numeroLei?.trim() || undefined,
    sigla: legislacao.sigla?.trim() || undefined,
    descricao: legislacao.descricaoCurta?.trim() || undefined,
    termosRelacionados: legislacao.termosRelacionados?.trim() || undefined,
    thumbnailUrl: legislacao.thumbnailUrl?.trim() || undefined,
    destaqueLegiscast: legislacao.destaqueLegiscast,
  };
}
