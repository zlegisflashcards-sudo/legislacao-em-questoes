import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LegisBotComentario } from "@/lib/legisbot-comentario";
import {
  gerarComentarioLegisBot,
  LEGISBOT_OPENAI_MODEL,
  OpenAIServiceError,
} from "@/lib/legisbot/generate-comment";
import {
  possuiTextoLegislacao,
  sanitizarHtmlLegislacao,
} from "@/lib/legisbot/sanitize-legal-html";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { sanitizarComentarioHtml } from "@/lib/legisbot/sanitize-comment-html";

export const dynamic = "force-dynamic";

const TABELA = "legisbot_comentarios";
const SLUG_VALIDO = /^[A-Z0-9_-]{1,50}$/;
const ORDEM_VALIDA = /^[A-Za-z0-9._-]{1,20}$/;

type RouteContext = {
  params: Promise<{ slug: string; ordem: string }>;
};

type DadosLegislacao = Pick<
  LegisBotComentario,
  "titulo" | "assunto" | "legislacao"
>;

export async function GET(request: Request, context: RouteContext) {
  const params = await context.params;
  const slug = params.slug.trim().toUpperCase();
  const ordem = params.ordem.trim();

  if (!SLUG_VALIDO.test(slug) || !ORDEM_VALIDA.test(ordem)) {
    return respostaErro("Parâmetros inválidos.", 400);
  }

  let supabase: SupabaseClient;
  try {
    supabase = getSupabaseServerClient();
  } catch {
    console.error("[LegisBot] Configuração do Supabase indisponível.");
    return respostaErro("Não foi possível processar a solicitação.", 500);
  }

  const consulta = await buscarTrecho(supabase, slug, ordem);
  if (consulta.error) {
    console.error("[LegisBot] Falha ao consultar o trecho.", { slug, ordem });
    return respostaErro("Não foi possível consultar o trecho.", 500);
  }

  let trecho = consulta.data;

  if (trecho?.status === "concluido" && trecho.comentario?.trim()) {
    return respostaSucesso("database", "gerado", trecho.comentario, trecho);
  }

  const dadosRecebidos = lerDadosRecebidos(request);

  if (!trecho) {
    if (!dadosLegislacaoValidos(dadosRecebidos)) {
      return respostaErro("Os dados do trecho são inválidos ou estão incompletos.", 400);
    }

    const criacao = await criarTrechoPendente(
      supabase,
      slug,
      ordem,
      dadosRecebidos,
    );

    if (criacao.error && criacao.error.code !== "23505") {
      console.error("[LegisBot] Falha ao criar a solicitação.", { slug, ordem });
      return respostaErro("Não foi possível registrar a solicitação.", 500);
    }

    if (criacao.data) {
      trecho = criacao.data;
    } else {
      const existente = await buscarTrecho(supabase, slug, ordem);
      if (existente.error || !existente.data) {
        console.error("[LegisBot] Falha ao recuperar solicitação concorrente.", {
          slug,
          ordem,
        });
        return respostaErro("Não foi possível processar a solicitação.", 500);
      }
      trecho = existente.data;
    }
  }

  if (trecho.status === "concluido" && trecho.comentario?.trim()) {
    return respostaSucesso("database", "gerado", trecho.comentario, trecho);
  }

  const camposAusentes = obterCamposAusentes(trecho);
  if (camposAusentes.length > 0) {
    const complemento = obterComplemento(camposAusentes, dadosRecebidos);
    if (!complemento) {
      return respostaErro("Os dados do trecho são inválidos ou estão incompletos.", 400);
    }

    const { data, error } = await supabase
      .from(TABELA)
      .update(complemento)
      .eq("id", trecho.id)
      .neq("status", "concluido")
      .select("*")
      .maybeSingle();

    if (error || !data) {
      console.error("[LegisBot] Falha ao completar os dados do trecho.", {
        slug,
        ordem,
      });
      return respostaErro("Não foi possível completar os dados do trecho.", 500);
    }
    trecho = data as LegisBotComentario;
  }

  if (trecho.status === "processando") {
    return respostaSucesso("processing", "pendente", null, trecho, 202);
  }

  const { data: bloqueio, error: bloqueioError } = await supabase
    .from(TABELA)
    .update({ status: "processando" })
    .eq("id", trecho.id)
    .in("status", ["pendente", "erro"])
    .select("*")
    .maybeSingle();

  if (bloqueioError) {
    console.error("[LegisBot] Falha ao reservar a geração.", { slug, ordem });
    return respostaErro("Não foi possível iniciar a geração.", 500);
  }

  if (!bloqueio) {
    return responderEstadoAtual(supabase, slug, ordem);
  }

  trecho = bloqueio as LegisBotComentario;

  try {
    const comment = await gerarComentarioLegisBot({
      titulo: trecho.titulo,
      assunto: trecho.assunto,
      legislacao: trecho.legislacao,
    });

    const { data: salvo, error: saveError } = await supabase
      .from(TABELA)
      .update({
        comentario: comment,
        status: "concluido",
        modelo_ia: LEGISBOT_OPENAI_MODEL,
      })
      .eq("id", trecho.id)
      .eq("status", "processando")
      .select("*")
      .maybeSingle();

    if (saveError || !salvo) {
      console.error("[LegisBot] Falha ao salvar o comentário.", { slug, ordem });
      await marcarComoErro(supabase, trecho.id);
      return respostaErro("Não foi possível salvar o comentário.", 500);
    }

    return respostaSucesso(
      "generated",
      "gerado",
      comment,
      salvo as LegisBotComentario,
    );
  } catch (error) {
    await marcarComoErro(supabase, trecho.id);
    console.error("[LegisBot] Falha durante a geração.", {
      slug,
      ordem,
      tipo: error instanceof OpenAIServiceError ? "openai" : "interno",
    });

    const status = error instanceof OpenAIServiceError && error.temporario ? 503 : 500;
    return respostaErro("Não foi possível gerar o comentário no momento.", status);
  }
}

function lerDadosRecebidos(request: Request): DadosLegislacao {
  const query = new URL(request.url).searchParams;
  return {
    titulo: query.get("titulo")?.trim() ?? "",
    assunto: query.get("assunto")?.trim() ?? "",
    legislacao: sanitizarHtmlLegislacao(query.get("legislacao") ?? ""),
  };
}

function dadosLegislacaoValidos(dados: DadosLegislacao): boolean {
  return Boolean(
    dados.titulo.length > 0 &&
      dados.titulo.length <= 255 &&
      dados.assunto.length > 0 &&
      dados.assunto.length <= 255 &&
      possuiTextoLegislacao(dados.legislacao),
  );
}

function obterCamposAusentes(trecho: LegisBotComentario) {
  return (["titulo", "assunto", "legislacao"] as const).filter(
    (campo) => !trecho[campo]?.trim(),
  );
}

function obterComplemento(
  campos: ReturnType<typeof obterCamposAusentes>,
  dados: DadosLegislacao,
): Partial<DadosLegislacao> | null {
  const complemento: Partial<DadosLegislacao> = {};

  for (const campo of campos) {
    const valor = dados[campo];
    const valido =
      campo === "legislacao"
        ? possuiTextoLegislacao(valor)
        : valor.length > 0 && valor.length <= 255;
    if (!valido) return null;
    complemento[campo] = valor;
  }

  return complemento;
}

async function buscarTrecho(
  supabase: SupabaseClient,
  slug: string,
  ordem: string,
) {
  const { data, error } = await supabase
    .from(TABELA)
    .select("*")
    .eq("slug", slug)
    .eq("ordem", ordem)
    .maybeSingle();

  return { data: data as LegisBotComentario | null, error };
}

async function criarTrechoPendente(
  supabase: SupabaseClient,
  slug: string,
  ordem: string,
  dados: DadosLegislacao,
) {
  const { data, error } = await supabase
    .from(TABELA)
    .insert({
      slug,
      ordem,
      ...dados,
      status: "pendente",
      comentario: null,
      modelo_ia: null,
    })
    .select("*")
    .maybeSingle();

  return { data: data as LegisBotComentario | null, error };
}

async function responderEstadoAtual(
  supabase: SupabaseClient,
  slug: string,
  ordem: string,
) {
  const { data, error } = await supabase
    .from(TABELA)
    .select("*")
    .eq("slug", slug)
    .eq("ordem", ordem)
    .maybeSingle();

  if (error || !data) {
    return respostaErro("Não foi possível consultar o estado da solicitação.", 500);
  }

  const trecho = data as LegisBotComentario;
  if (trecho.status === "concluido" && trecho.comentario) {
    return respostaSucesso("database", "gerado", trecho.comentario, trecho);
  }

  return respostaSucesso("processing", "pendente", null, trecho, 202);
}

async function marcarComoErro(supabase: SupabaseClient, id: number) {
  const { error } = await supabase
    .from(TABELA)
    .update({ status: "erro" })
    .eq("id", id)
    .eq("status", "processando");

  if (error) {
    console.error("[LegisBot] Não foi possível registrar o estado de erro.", { id });
  }
}

function respostaSucesso(
  source: "database" | "generated" | "processing",
  status: "gerado" | "pendente",
  comment: string | null,
  trecho: LegisBotComentario,
  httpStatus = 200,
) {
  return NextResponse.json(
    {
      success: true,
      source,
      status,
      comment: comment ? sanitizarComentarioHtml(comment) : null,
      titulo: trecho.titulo,
      assunto: trecho.assunto,
      legislacao: sanitizarHtmlLegislacao(trecho.legislacao),
      modelo_ia: trecho.modelo_ia,
    },
    { status: httpStatus, headers: { "Cache-Control": "no-store" } },
  );
}

function respostaErro(message: string, status: number) {
  return NextResponse.json(
    { success: false, error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
