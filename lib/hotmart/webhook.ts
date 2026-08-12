import { timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createOperationalAdminNotification } from "../admin-notification-server";

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

type ValidAcquisitionHandler = (input: { studentId: string; origin: "hotmart"; idempotencyKey: string; accessLabel: string }) => Promise<void>;

const EVENTOS_ATIVACAO = new Set(["PURCHASE_APPROVED", "PURCHASE_COMPLETE"]);
const EVENTOS_PEDIDO_REEMBOLSO = new Set(["PURCHASE_REFUND_REQUEST", "PURCHASE_REFUND_REQUESTED", "PURCHASE_REFUND_PENDING"]);
const EVENTOS_PERDA_ACESSO = {
  PURCHASE_CANCELED: { status: "cancelada", statusAcesso: "cancelado", statusLiberacao: "cancelado", data: "cancelada_em" },
  PURCHASE_REFUNDED: { status: "reembolsada", statusAcesso: "reembolsado", statusLiberacao: "reembolsado", data: "reembolsada_em" },
  PURCHASE_CHARGEBACK: { status: "chargeback", statusAcesso: "reembolsado", statusLiberacao: "reembolsado", data: "reembolsada_em" },
  PURCHASE_PROTEST: { status: "protestada", statusAcesso: "cancelado", statusLiberacao: "cancelado", data: "cancelada_em" },
} as const;

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

function mensagemErroAdminSegura(error: unknown) {
  if (error instanceof Error) {
    const message = error.message.trim();
    if (message) return message.slice(0, 1000);
  }
  if (typeof error === "string" && error.trim()) return error.trim().slice(0, 1000);
  return "Falha nao identificada no processamento da Hotmart.";
}

async function obterOuCriarAlunoHotmart(
  supabase: SupabaseClient,
  evento: EventoHotmartNormalizado,
  alunoExistenteId?: string | null,
) {
  if (alunoExistenteId) {
    return alunoExistenteId;
  }

  const criado = await supabase.rpc("obter_ou_criar_aluno_por_email", {
    p_email: evento.email_comprador,
    p_nome: evento.nome_comprador,
    p_telefone: evento.telefone_comprador,
  });
  if (criado.error || !criado.data) {
    throw criado.error ?? new Error("Nao foi possivel localizar ou criar o aluno.");
  }
  return criado.data as string;
}

function classificarAcaoHotmart(evento: EventoHotmartNormalizado) {
  if (EVENTOS_ATIVACAO.has(evento.tipo_evento ?? "") || ["APPROVED", "COMPLETE"].includes(evento.status_transacao ?? "")) {
    return "ativar" as const;
  }
  if (EVENTOS_PEDIDO_REEMBOLSO.has(evento.tipo_evento ?? "") || evento.status_transacao === "PARTIALLY_REFUNDED") {
    return "reembolso_solicitado" as const;
  }
  if ((evento.tipo_evento ?? "") in EVENTOS_PERDA_ACESSO || ["CANCELLED", "CHARGEBACK", "DISPUTE", "REFUNDED"].includes(evento.status_transacao ?? "")) {
    return "revogar" as const;
  }
  return "ignorar" as const;
}

async function restaurarLiberacoesDaCompra(supabase: SupabaseClient, compraId: string, alunoId: string, produtoId: string) {
  const leis = await supabase.from("produto_leis").select("lei_id").eq("produto_id", produtoId);
  if (leis.error) throw leis.error;
  if (!leis.data?.length) return;

  const existentes = await supabase.from("liberacoes_leis").select("id,lei_id,status").eq("compra_id", compraId);
  if (existentes.error) throw existentes.error;

  const leisExistentes = new Set((existentes.data ?? []).map(({ lei_id }) => lei_id));
  const pendentes = leis.data.filter(({ lei_id }) => !leisExistentes.has(lei_id));
  if (pendentes.length) {
    const liberacoes = await supabase.from("liberacoes_leis").insert(
      pendentes.map(({ lei_id }) => ({
        aluno_id: alunoId,
        lei_id,
        compra_id: compraId,
        produto_id: produtoId,
        origem: "hotmart",
        status: "ativo",
        motivo: "Webhook Hotmart: restauração de acesso",
      })),
    );
    if (liberacoes.error) throw liberacoes.error;
  }

  const aRestaurar = (existentes.data ?? []).filter((row) => row.status !== "ativo").map((row) => row.id);
  if (aRestaurar.length) {
    const atualizacao = await supabase
      .from("liberacoes_leis")
      .update({ status: "ativo", motivo: null, revogada_por: null, revogada_em: null })
      .in("id", aRestaurar);
    if (atualizacao.error) throw atualizacao.error;
  }
}

async function revogarLiberacoesDaCompra(supabase: SupabaseClient, compraId: string, statusLiberacao: string, motivo: string) {
  const liberacoes = await supabase
    .from("liberacoes_leis")
    .update({ status: statusLiberacao, motivo, revogada_em: new Date().toISOString() })
    .eq("compra_id", compraId)
    .eq("status", "ativo");
  if (liberacoes.error) throw liberacoes.error;
}

async function atualizarCompraHotmart(
  supabase: SupabaseClient,
  compraId: string,
  atualizacao: Record<string, string | null>,
) {
  const compraAtualizada = await supabase.from("compras").update(atualizacao).eq("id", compraId);
  if (compraAtualizada.error) throw compraAtualizada.error;
}

async function sincronizarCompraHotmart(
  supabase: SupabaseClient,
  compra: { id: string; status?: string | null; status_acesso?: string | null; produto_id?: string | null; aluno_id?: string | null },
  evento: EventoHotmartNormalizado,
  acao: "ativar" | "reembolso_solicitado" | "revogar",
): Promise<{ restored: boolean; refundRequested: boolean; concluded: boolean }> {
  const agora = evento.aprovada_em ?? new Date().toISOString();
  if (acao === "ativar") {
    let restored = false;
    if (compra.status !== "aprovada" || compra.status_acesso !== "ativo") {
      await atualizarCompraHotmart(supabase, compra.id, {
        status: "aprovada",
        status_acesso: "ativo",
        comprada_em: agora,
        adquirida_em: agora,
        cancelada_em: null,
        reembolsada_em: null,
        reativada_em: agora,
        reembolso_solicitado_em: null,
      });
      restored = true;
    }
    if (compra.produto_id && compra.aluno_id) {
      await restaurarLiberacoesDaCompra(supabase, compra.id, compra.aluno_id, compra.produto_id);
    }
    return { restored, refundRequested: false, concluded: false };
  }

  if (acao === "reembolso_solicitado") {
    let refundRequested = false;
    if (compra.status !== "reembolso_solicitado" || compra.status_acesso !== "reembolso_solicitado") {
      await atualizarCompraHotmart(supabase, compra.id, {
        status: "reembolso_solicitado",
        status_acesso: "reembolso_solicitado",
        reembolso_solicitado_em: agora,
      });
      refundRequested = true;
    }
    await revogarLiberacoesDaCompra(supabase, compra.id, "cancelado", "Webhook Hotmart: pedido de reembolso");
    return { restored: false, refundRequested, concluded: false };
  }

  const perda = EVENTOS_PERDA_ACESSO[evento.tipo_evento as keyof typeof EVENTOS_PERDA_ACESSO] ?? EVENTOS_PERDA_ACESSO.PURCHASE_CANCELED;
  let concluded = false;
  if (compra.status !== perda.status || compra.status_acesso !== perda.statusAcesso) {
    await atualizarCompraHotmart(supabase, compra.id, {
      status: perda.status,
      status_acesso: perda.statusAcesso,
      [perda.data]: agora,
    });
    concluded = true;
  }
  await revogarLiberacoesDaCompra(supabase, compra.id, perda.statusLiberacao, `Webhook Hotmart: ${evento.tipo_evento}`);
  return { restored: false, refundRequested: false, concluded };
}

function adminNotificationLink(transaction: string | null) {
  return `/admin/comercial?tab=aquisicoes${transaction ? `&q=${encodeURIComponent(transaction)}` : ""}`;
}

function hotmartParticipantLabel(evento: EventoHotmartNormalizado, compra: { id: string; produto_id?: string | null; aluno_id?: string | null }) {
  const aluno = evento.nome_comprador || evento.email_comprador || compra.aluno_id || "Aluno";
  const produto = evento.hotmart_product_id || compra.produto_id || "produto Hotmart";
  return { aluno, produto };
}

async function notificarMudancaReembolso(
  supabase: SupabaseClient,
  evento: EventoHotmartNormalizado,
  compra: { id: string; produto_id?: string | null; aluno_id?: string | null },
  resultado: { restored: boolean; refundRequested: boolean; concluded: boolean },
) {
  const entidadeBase = evento.codigo_transacao ?? compra.id;
  const { aluno, produto } = hotmartParticipantLabel(evento, compra);
  const dataHora = evento.aprovada_em ? ` Data/Hora: ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(evento.aprovada_em))}.` : "";

  if (resultado.refundRequested) {
    await createOperationalAdminNotification(supabase, {
      tipo: "reembolso_solicitado",
      titulo: "Reembolso solicitado",
      mensagem: `${aluno} solicitou reembolso de ${produto}. O acesso correspondente foi suspenso.${dataHora}`,
      link: adminNotificationLink(evento.codigo_transacao),
      entidadeTipo: "reembolso_solicitado_hotmart",
      entidadeId: `reembolso_solicitado:${entidadeBase}`,
    });
  }

  if (resultado.concluded) {
    await createOperationalAdminNotification(supabase, {
      tipo: "reembolso_concluido",
      titulo: evento.tipo_evento === "PURCHASE_CHARGEBACK" ? "Chargeback concluído" : evento.tipo_evento === "PURCHASE_PROTEST" ? "Protesto concluído" : "Reembolso concluído",
      mensagem: `${aluno} teve a aquisição de ${produto} encerrada. O acesso dessa compra permanece revogado.${dataHora}`,
      link: adminNotificationLink(evento.codigo_transacao),
      entidadeTipo: "reembolso_concluido_hotmart",
      entidadeId: `reembolso_concluido:${evento.tipo_evento}:${entidadeBase}`,
    });
  }

  if (resultado.restored) {
    await createOperationalAdminNotification(supabase, {
      tipo: "acesso_restaurado",
      titulo: "Acesso restaurado",
      mensagem: `O acesso de ${aluno} ao produto ${produto} foi restaurado após atualização da Hotmart.${dataHora}`,
      link: adminNotificationLink(evento.codigo_transacao),
      entidadeTipo: "acesso_restaurado_hotmart",
      entidadeId: `acesso_restaurado:${entidadeBase}`,
    });
  }
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

export async function registrarEventoHotmart(supabase: SupabaseClient, payload: unknown, onValidAcquisition?: ValidAcquisitionHandler) {
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

  const acao = classificarAcaoHotmart(normalizado);
  if (acao === "ignorar") {
    return { duplicate };
  }

  try {
    let resultadoAtualizacao: { restored: boolean; refundRequested: boolean; concluded: boolean } | null = null;
    if (acao === "ativar") {
      const resultadoVenda = await processarVendaAprovadaHotmart(supabase, normalizado, onValidAcquisition);
      resultadoAtualizacao = resultadoVenda.restaurado ? { restored: true, refundRequested: false, concluded: false } : null;
    } else {
      resultadoAtualizacao = await processarAtualizacaoAcessoHotmart(supabase, normalizado, acao);
    }
    if (resultadoAtualizacao) {
      const compra = await supabase
        .from("compras")
        .select("id,produto_id,aluno_id")
        .eq("origem", "hotmart")
        .eq("identificador_externo", normalizado.codigo_transacao)
        .maybeSingle();
      if (!compra.error && compra.data) {
        await notificarMudancaReembolso(supabase, normalizado, compra.data as { id: string; produto_id?: string | null; aluno_id?: string | null }, resultadoAtualizacao);
      }
    }
    const atualizado = await supabase
      .from("hotmart_eventos")
      .update({ processado: true, erro_processamento: null })
      .eq("identificador_evento", normalizado.identificador_evento);
    if (atualizado.error) throw atualizado.error;
    return { duplicate };
  } catch (processingError) {
    const mensagem = mensagemErroAdminSegura(processingError);
    const atualizado = await supabase
      .from("hotmart_eventos")
      .update({ processado: false, erro_processamento: mensagem })
      .eq("identificador_evento", normalizado.identificador_evento);
    if (atualizado.error) console.error("Não foi possível registrar o erro do evento Hotmart:", atualizado.error);
    throw processingError;
  }
}

export async function processarAtualizacaoAcessoHotmart(
  supabase: SupabaseClient,
  evento: EventoHotmartNormalizado,
  acao: "reembolso_solicitado" | "revogar",
): Promise<{ restored: boolean; refundRequested: boolean; concluded: boolean } | null> {
  if (!evento.codigo_transacao) throw new Error("Evento Hotmart sem código da transação.");

  if (evento.hotmart_product_id) {
    const produto = await supabase
      .from("produtos")
      .select("id")
      .eq("hotmart_product_id", evento.hotmart_product_id)
      .maybeSingle();
    if (produto.error) throw produto.error;
    if (!produto.data) return null;
  }

  const compra = await supabase
    .from("compras")
    .select("id,status,status_acesso,produto_id,aluno_id")
    .eq("origem", "hotmart")
    .eq("identificador_externo", evento.codigo_transacao)
    .maybeSingle();
  if (compra.error) throw compra.error;
  if (!compra.data) throw new Error("Compra Hotmart não encontrada para a transação.");

  return sincronizarCompraHotmart(supabase, compra.data as { id: string; status?: string | null; status_acesso?: string | null; produto_id?: string | null; aluno_id?: string | null }, evento, acao);
}

export async function processarVendaAprovadaHotmart(supabase: SupabaseClient, evento: EventoHotmartNormalizado, onValidAcquisition?: ValidAcquisitionHandler) {
  if (!evento.email_comprador) throw new Error("Evento Hotmart sem e-mail do comprador.");
  if (!evento.codigo_transacao) throw new Error("Evento Hotmart sem código da transação.");
  if (!evento.hotmart_product_id) throw new Error("Evento Hotmart sem código do produto.");

  const compraExistente = await supabase
    .from("compras")
    .select("id,aluno_id,produto_id,status,status_acesso")
    .eq("origem", "hotmart")
    .eq("identificador_externo", evento.codigo_transacao)
    .maybeSingle();
  if (compraExistente.error) throw compraExistente.error;
  if (compraExistente.data) {
    const alunoId = await obterOuCriarAlunoHotmart(supabase, evento, compraExistente.data.aluno_id as string | null | undefined);
    if (!compraExistente.data.aluno_id) {
      const vinculo = await supabase
        .from("compras")
        .update({ aluno_id: alunoId })
        .eq("id", compraExistente.data.id)
        .is("aluno_id", null);
      if (vinculo.error) throw vinculo.error;
    }
    return {
      duplicate: true,
      restaurado: (await sincronizarCompraHotmart(
        supabase,
        {
          id: compraExistente.data.id as string,
          status: compraExistente.data.status as string | null,
          status_acesso: compraExistente.data.status_acesso as string | null,
          produto_id: compraExistente.data.produto_id as string,
          aluno_id: alunoId,
        },
        evento,
        "ativar",
      )).restored,
    };
  }

  const produto = await supabase
    .from("produtos")
    .select("id,nome,hotmart_product_id,ativo")
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
    const criado = await supabase.rpc("obter_ou_criar_aluno_por_email", {
      p_email: evento.email_comprador, p_nome: evento.nome_comprador, p_telefone: evento.telefone_comprador,
    });
    if (criado.error || !criado.data) throw criado.error ?? new Error("Não foi possível criar o aluno.");
    alunoId = criado.data as string;
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

  await restaurarLiberacoesDaCompra(supabase, compraCriada.id as string, alunoId, produtoInterno.id as string);
  if (onValidAcquisition) await onValidAcquisition({ studentId: alunoId, origin: "hotmart", idempotencyKey: `hotmart:${evento.codigo_transacao}`, accessLabel: produtoInterno.nome as string });
  return { duplicate: false, restaurado: false };
}
