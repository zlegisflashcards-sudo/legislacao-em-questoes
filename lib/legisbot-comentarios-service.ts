import { supabase } from "@/lib/supabase";
import type {
  LegisBotComentario,
  NovoLegisBotComentario,
} from "@/lib/legisbot-comentario";

const TABELA = "legisbot_comentarios";
const CODIGO_CONFLITO_UNICO = "23505";

export interface IdentificadoresLegisBot {
  slug: string;
  ordem: string;
}

/**
 * Resultado local de uma inserção pendente. A política RLS não permite ler a
 * linha enquanto ela ainda não estiver concluída, portanto os campos gerados
 * pelo banco (id e timestamps) não fazem parte deste retorno.
 */
export type SolicitacaoPendente = NovoLegisBotComentario & {
  comentario: null;
  status: "pendente";
  modelo_ia: null;
};

export type ResultadoSolicitacao = LegisBotComentario | SolicitacaoPendente;

export function normalizarIdentificadores(
  slug: string,
  ordem: string,
): IdentificadoresLegisBot {
  const slugNormalizado = slug.trim().toUpperCase();
  const ordemNormalizada = ordem.trim();

  if (!slugNormalizado || !ordemNormalizada) {
    throw new Error("Não foi possível identificar o trecho da legislação.");
  }

  return { slug: slugNormalizado, ordem: ordemNormalizada };
}

export async function buscarComentario(
  slug: string,
  ordem: string,
): Promise<LegisBotComentario | null> {
  const identificadores = normalizarIdentificadores(slug, ordem);
  const { data, error } = await supabase
    .from(TABELA)
    .select("*")
    .eq("slug", identificadores.slug)
    .eq("ordem", identificadores.ordem)
    .maybeSingle();

  if (error) {
    throw new Error("Não foi possível consultar o comentário no momento.");
  }

  return data as LegisBotComentario | null;
}

export async function buscarComentarioConcluido(
  slug: string,
  ordem: string,
): Promise<LegisBotComentario | null> {
  const identificadores = normalizarIdentificadores(slug, ordem);
  const { data, error } = await supabase
    .from(TABELA)
    .select("*")
    .eq("slug", identificadores.slug)
    .eq("ordem", identificadores.ordem)
    .eq("status", "concluido")
    .maybeSingle();

  if (error) {
    throw new Error("Não foi possível consultar o comentário no momento.");
  }

  return data as LegisBotComentario | null;
}

export async function criarSolicitacaoPendente(
  dados: NovoLegisBotComentario,
): Promise<SolicitacaoPendente> {
  const identificadores = normalizarIdentificadores(dados.slug, dados.ordem);
  const solicitacao: SolicitacaoPendente = {
    ...dados,
    ...identificadores,
    status: "pendente",
    comentario: null,
    modelo_ia: null,
  };

  const { error } = await supabase.from(TABELA).insert(solicitacao);

  if (error) {
    if (error.code === CODIGO_CONFLITO_UNICO) {
      throw new ConflitoSolicitacaoError();
    }

    throw new Error("Não foi possível registrar a solicitação no momento.");
  }

  return solicitacao;
}

export async function buscarOuCriarSolicitacao(
  dados: NovoLegisBotComentario,
): Promise<ResultadoSolicitacao> {
  const identificadores = normalizarIdentificadores(dados.slug, dados.ordem);
  const dadosNormalizados = { ...dados, ...identificadores };
  const existente = await buscarComentario(
    identificadores.slug,
    identificadores.ordem,
  );

  if (existente) {
    return existente;
  }

  try {
    return await criarSolicitacaoPendente(dadosNormalizados);
  } catch (error) {
    if (!(error instanceof ConflitoSolicitacaoError)) {
      throw error;
    }

    // Uma requisição concorrente pode ter concluído entre a busca e o insert.
    // Pela RLS pública, somente linhas concluídas podem ser relidas.
    const criadoPelaRequisicaoConcorrente = await buscarComentario(
      identificadores.slug,
      identificadores.ordem,
    );

    if (criadoPelaRequisicaoConcorrente) {
      return criadoPelaRequisicaoConcorrente;
    }

    // A linha concorrente ainda está pendente e fica invisível pela RLS. O
    // frontend recebe a mesma representação pendente, sem detalhes do conflito.
    return criarRepresentacaoPendente(dadosNormalizados);
  }
}

class ConflitoSolicitacaoError extends Error {
  constructor() {
    super("Conflito interno ao criar solicitação.");
    this.name = "ConflitoSolicitacaoError";
  }
}

function criarRepresentacaoPendente(
  dados: NovoLegisBotComentario,
): SolicitacaoPendente {
  return {
    ...dados,
    status: "pendente",
    comentario: null,
    modelo_ia: null,
  };
}

