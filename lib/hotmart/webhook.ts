import { timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export type HotmartPayload = Record<string, unknown> & {
  id?: unknown;
  event?: unknown;
  creation_date?: unknown;
  data?: HotmartDados;
  buyer?: HotmartDados["buyer"];
  product?: HotmartDados["product"];
  purchase?: HotmartDados["purchase"];
};

type HotmartDados = {
  buyer?: { email?: unknown; name?: unknown; checkout_phone?: unknown };
  product?: { id?: unknown; name?: unknown };
  purchase?: { transaction?: unknown; status?: unknown; approved_date?: unknown };
};

export type EventoHotmartNormalizado = {
  identificador_evento: string;
  codigo_transacao: string | null;
  hotmart_product_id: string | null;
  tipo_evento: string | null;
  status_transacao: string | null;
  email_comprador: string | null;
  nome_comprador: string | null;
  telefone_comprador: string | null;
  aprovada_em: string | null;
};

function texto(valor: unknown) {
  return typeof valor === "string" && valor.trim() ? valor.trim() : null;
}

function dataHotmart(valor: unknown) {
  const numero = typeof valor === "number" ? valor : Number(texto(valor));
  const data = Number.isFinite(numero) && numero > 0
    ? new Date(numero < 10_000_000_000 ? numero * 1000 : numero)
    : texto(valor) ? new Date(texto(valor) as string) : null;
  return data && !Number.isNaN(data.getTime()) ? data.toISOString() : null;
}

export function validarHottok(recebido: string | null, esperado: string | undefined) {
  if (!recebido || !esperado) return false;
  const recebidoBuffer = Buffer.from(recebido);
  const esperadoBuffer = Buffer.from(esperado);
  return recebidoBuffer.length === esperadoBuffer.length && timingSafeEqual(recebidoBuffer, esperadoBuffer);
}

export function diagnosticoHottok(recebido: string | null, configurado: string | undefined) {
  return {
    hottokRecebido: Boolean(recebido),
    hottokConfigurado: Boolean(configurado),
    tamanhoRecebido: recebido?.length ?? 0,
    tamanhoConfigurado: configurado?.length ?? 0,
  };
}

export function normalizarEventoHotmart(payload: unknown): EventoHotmartNormalizado {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Payload inválido.");
  }

  const evento = payload as HotmartPayload;
  const identificadorEvento = texto(evento.id);
  if (!identificadorEvento) throw new Error("Evento Hotmart sem identificador.");

  const dados = evento.data && typeof evento.data === "object" && !Array.isArray(evento.data)
    ? evento.data
    : evento;
  const produtoId = dados.product?.id;
  return {
    identificador_evento: identificadorEvento,
    codigo_transacao: texto(dados.purchase?.transaction),
    hotmart_product_id: produtoId === undefined || produtoId === null ? null : String(produtoId).trim() || null,
    tipo_evento: texto(evento.event) ?? "UNKNOWN",
    status_transacao: texto(dados.purchase?.status),
    email_comprador: texto(dados.buyer?.email)?.toLowerCase() ?? null,
    nome_comprador: texto(dados.buyer?.name),
    telefone_comprador: texto(dados.buyer?.checkout_phone),
    aprovada_em: dataHotmart(dados.purchase?.approved_date),
  };
}

export async function registrarEventoHotmart(supabase: SupabaseClient, payload: unknown) {
  const normalizado = normalizarEventoHotmart(payload);
  const { error } = await supabase.from("hotmart_eventos").insert({
    identificador_evento: normalizado.identificador_evento,
    codigo_transacao: normalizado.codigo_transacao,
    hotmart_product_id: normalizado.hotmart_product_id,
    tipo_evento: normalizado.tipo_evento,
    status_transacao: normalizado.status_transacao,
    email_comprador: normalizado.email_comprador,
    hotmart_event_id: normalizado.identificador_evento,
    evento: normalizado.tipo_evento,
    hotmart_transaction_id: normalizado.codigo_transacao,
    payload,
    payload_bruto: payload,
    payload_normalizado: normalizado,
  });

  let duplicate = false;
  if (error?.code === "23505") {
    duplicate = true;
    const existente = await supabase
      .from("hotmart_eventos")
      .select("processado")
      .eq("identificador_evento", normalizado.identificador_evento)
      .maybeSingle();
    if (existente.error) throw existente.error;
    if (existente.data?.processado) return { duplicate: true };
  }
  if (error && error.code !== "23505") throw error;

  if (normalizado.tipo_evento !== "PURCHASE_APPROVED" || normalizado.status_transacao !== "APPROVED") {
    return { duplicate };
  }

  try {
    await processarVendaAprovadaHotmart(supabase, normalizado);
    const atualizado = await supabase
      .from("hotmart_eventos")
      .update({ processado: true, erro_processamento: null })
      .eq("identificador_evento", normalizado.identificador_evento);
    if (atualizado.error) throw atualizado.error;
    return { duplicate };
  } catch (processingError) {
    const mensagem = processingError instanceof Error ? processingError.message.slice(0, 1000) : "Erro desconhecido";
    const atualizado = await supabase
      .from("hotmart_eventos")
      .update({ processado: false, erro_processamento: mensagem })
      .eq("identificador_evento", normalizado.identificador_evento);
    if (atualizado.error) console.error("Não foi possível registrar o erro do evento Hotmart:", atualizado.error);
    throw processingError;
  }
}

export async function processarVendaAprovadaHotmart(supabase: SupabaseClient, evento: EventoHotmartNormalizado) {
  if (!evento.email_comprador) throw new Error("Evento Hotmart sem e-mail do comprador.");
  if (!evento.codigo_transacao) throw new Error("Evento Hotmart sem código da transação.");
  if (!evento.hotmart_product_id) throw new Error("Evento Hotmart sem código do produto.");

  const compraExistente = await supabase
    .from("compras")
    .select("id,aluno_id,produto_id")
    .eq("origem", "hotmart")
    .eq("identificador_externo", evento.codigo_transacao)
    .maybeSingle();
  if (compraExistente.error) throw compraExistente.error;
  if (compraExistente.data) {
    await liberarLeisDaCompra(
      supabase,
      compraExistente.data.id as string,
      compraExistente.data.aluno_id as string,
      compraExistente.data.produto_id as string,
    );
    return { duplicate: true };
  }

  const produto = await supabase
    .from("produtos")
    .select("id,hotmart_product_id,ativo")
    .eq("hotmart_product_id", evento.hotmart_product_id)
    .maybeSingle();
  if (produto.error) throw produto.error;
  const produtoInterno = produto.data;
  if (!produtoInterno) throw new Error("Produto interno não encontrado para o código Hotmart.");
  if (!produtoInterno.ativo) throw new Error("Produto interno está inativo.");

  const alunoExistente = await supabase
    .from("alunos")
    .select("id,nome,telefone")
    .ilike("email", evento.email_comprador)
    .limit(1)
    .maybeSingle();
  if (alunoExistente.error) throw alunoExistente.error;

  const alunoAtual = alunoExistente.data;
  let alunoId = alunoAtual?.id as string | undefined;
  if (alunoId) {
    const dadosAluno: Record<string, string> = {};
    if (!alunoAtual?.nome && evento.nome_comprador) dadosAluno.nome = evento.nome_comprador;
    if (!alunoAtual?.telefone && evento.telefone_comprador) dadosAluno.telefone = evento.telefone_comprador;
    if (Object.keys(dadosAluno).length) {
      const atualizado = await supabase.from("alunos").update(dadosAluno).eq("id", alunoId);
      if (atualizado.error) throw atualizado.error;
    }
  } else {
    const criado = await supabase
      .from("alunos")
      .insert({ nome: evento.nome_comprador, email: evento.email_comprador, telefone: evento.telefone_comprador })
      .select("id")
      .single();
    if (criado.error || !criado.data) throw criado.error ?? new Error("Não foi possível criar o aluno.");
    alunoId = criado.data.id as string;
  }

  const agora = evento.aprovada_em ?? new Date().toISOString();
  const compra = await supabase
    .from("compras")
    .insert({
      aluno_id: alunoId, produto_id: produtoInterno.id, hotmart_product_id: produtoInterno.hotmart_product_id,
      hotmart_transaction_id: evento.codigo_transacao, status: "aprovada", origem: "hotmart",
      identificador_externo: evento.codigo_transacao, observacao_administrativa: "Webhook Hotmart: PURCHASE_APPROVED",
      status_acesso: "ativo", adquirida_em: agora, comprada_em: agora,
    })
    .select("id")
    .single();
  const compraCriada = compra.data;
  if (compra.error || !compraCriada) {
    if (compra.error?.code === "23505") return { duplicate: true };
    throw compra.error ?? new Error("Não foi possível registrar a compra.");
  }

  await liberarLeisDaCompra(supabase, compraCriada.id as string, alunoId, produtoInterno.id as string);
  return { duplicate: false };
}

async function liberarLeisDaCompra(
  supabase: SupabaseClient,
  compraId: string,
  alunoId: string,
  produtoId: string,
) {
  const leis = await supabase.from("produto_leis").select("lei_id").eq("produto_id", produtoId);
  if (leis.error) throw leis.error;
  if (!leis.data?.length) return;

  const existentes = await supabase.from("liberacoes_leis").select("lei_id").eq("compra_id", compraId);
  if (existentes.error) throw existentes.error;
  const leisExistentes = new Set((existentes.data ?? []).map(({ lei_id }) => lei_id));
  const pendentes = leis.data.filter(({ lei_id }) => !leisExistentes.has(lei_id));
  if (pendentes.length) {
    const liberacoes = await supabase.from("liberacoes_leis").insert(
      pendentes.map(({ lei_id }) => ({
        aluno_id: alunoId, lei_id, compra_id: compraId, produto_id: produtoId,
        origem: "hotmart", status: "ativo", motivo: "Webhook Hotmart: PURCHASE_APPROVED",
      })),
    );
    if (liberacoes.error) throw liberacoes.error;
  }
}
