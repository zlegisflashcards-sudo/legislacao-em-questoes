import "server-only";
import { randomBytes } from "node:crypto";

import type { User } from "@supabase/supabase-js";
import { obterAdministrador } from "@/lib/admin-auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { notifyStudentAccess, sendManualStudentAccessEmail, type FirstAccessOrigin } from "@/lib/student-first-access-server";
import { createOperationalAdminNotification } from "@/lib/admin-notification-server";
import { normalizeHistoricalHotmartStatus, type HistoricalSaleStatus } from "@/lib/historical-import-status";
import {
  COMMERCIAL_ORIGINS,
  EDITORIAL_IMPORTANCE,
  EDITORIAL_UPDATE_TYPES,
  LAW_UPDATE_STATUSES,
  MANUAL_ORIGINS,
  MATERIAL_ACTIONS,
  MATERIAL_PROVIDERS,
  MATERIAL_TYPES,
  PRODUCT_TYPES,
  CommercialValidationError,
  asObject,
  booleanValue,
  enumValue,
  idList,
  limitFrom,
  nonNegativeInteger,
  optionalIsoDate,
  optionalNonNegativeInteger,
  optionalProductDemoVideoUrl,
  optionalString,
  optionalTimestamp,
  pageFrom,
  positiveIntegerId,
  rejectUnknownKeys,
  requiredString,
  safeSearch,
  slug,
  uuid,
  type JsonObject,
} from "@/lib/commercial-admin-validation";

export type CommercialResource =
  | "leis"
  | "materiais"
  | "produtos"
  | "aquisicoes"
  | "liberacoes"
  | "atualizacoes"
  | "anki_tutoriais"
  | "auditoria"
  | "alunos";

export class CommercialHttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "CommercialHttpError";
  }
}

async function requireAdmin(): Promise<User> {
  const admin = await obterAdministrador();
  if (!admin) throw new CommercialHttpError(401, "Autenticação administrativa obrigatória.");
  return admin;
}

function assertQuery(result: { error: { message?: string } | null }) {
  if (result.error) throw new CommercialHttpError(500, "Não foi possível consultar os dados comerciais.");
}
function isMissingPostSaleSchema(result: { error: { code?: string; message?: string } | null }) {
  const message = String(result.error?.message ?? "").toLowerCase();
  return ["42p01", "pgrst205"].includes(String(result.error?.code ?? "").toLowerCase()) || message.includes("alunos_pos_venda");
}
function isMissingPurchasePostSaleSchema(result: { error: { code?: string; message?: string } | null }) {
  const message = String(result.error?.message ?? "").toLowerCase();
  return ["42p01", "pgrst205"].includes(String(result.error?.code ?? "").toLowerCase())
    && (message.includes("compras_pos_venda") || message.includes("relation"));
}
function postSaleStageState({ accessActive, emailSent, firstAccessAt, stage5At, stage6At, overrides = [] }: { accessActive: boolean; emailSent: boolean; firstAccessAt: unknown; stage5At: unknown; stage6At: unknown; overrides?: number[] }) {
  const automaticas = [true, accessActive, emailSent, Boolean(firstAccessAt), false, false];
  const manuais = [1, 2, 3, 4, 5, 6].map((etapa) => overrides.includes(etapa) || (etapa === 5 && Boolean(stage5At)) || (etapa === 6 && Boolean(stage6At)));
  return { automaticas, manuais, etapas: automaticas.map((automatic, index) => automatic || manuais[index]) };
}
function accessEmailForPurchase(notices: Record<string, unknown>[], purchase: Record<string, unknown>) {
  const purchaseId = String(purchase.id ?? "");
  const externalId = String(purchase.identificador_externo ?? "");
  const keys = new Set([purchaseId && `administrativo:${purchaseId}`, externalId && `hotmart:${externalId}`].filter(Boolean));
  return notices
    .filter((notice) => notice.status === "enviado" && keys.has(String(notice.idempotency_key ?? "")))
    .sort((left, right) => String(right.criado_em ?? "").localeCompare(String(left.criado_em ?? "")))[0] ?? null;
}

function logCommercialDbError(context: string, error: { code?: string; message?: string; details?: string; hint?: string } | null | undefined, extra: Record<string, unknown> = {}) {
  console.error(context, {
    ...extra,
    code: error?.code ?? null,
    message: String(error?.message ?? "").replace(/[\r\n]+/g, " ").slice(0, 500),
    details: String(error?.details ?? "").replace(/[\r\n]+/g, " ").slice(0, 500),
    hint: String(error?.hint ?? "").replace(/[\r\n]+/g, " ").slice(0, 500),
  });
}

async function rpc(name: string, params: JsonObject) {
  if (name === "admin_mesclar_alunos") {
    console.info("Chamada RPC de mesclagem administrativa", {
      rpc: name,
      argumentNames: Object.keys(params).sort(),
      principal: params.p_principal,
      secundario: params.p_secundario,
      adminIdSent: typeof params.p_ator_user_id === "string",
      nomeFinalType: params.p_nome_final === null ? "null" : typeof params.p_nome_final,
    });
  }
  const result = await getSupabaseServerClient().rpc(name, params);
  if (result.error) {
    const code = String(result.error.code ?? "");
    const technical = String(result.error.message ?? "Erro de banco sem mensagem.").replace(/[\r\n]+/g, " ").slice(0, 500);
    const isStudentDeletion = name === "admin_excluir_aluno_definitivamente" || name === "admin_resumo_exclusao_aluno";
    if (isStudentDeletion) {
      console.error("Falha na exclusão administrativa de aluno", {
        rpc: name,
        alunoId: params.p_aluno_id ?? null,
        etapa: name === "admin_resumo_exclusao_aluno" ? "preflight" : "transacao_banco",
        code,
        message: technical,
        details: result.error.details ?? null,
        hint: result.error.hint ?? null,
      });
      if (code === "42883" || code === "PGRST202") {
        throw new CommercialHttpError(503, "Não foi possível excluir: a rotina de banco necessária ainda não está disponível.");
      }
      if (code === "23503") {
        throw new CommercialHttpError(422, `Não foi possível excluir: existe vínculo pendente ou referência não suportada. ${technical}`);
      }
      if (["22023", "P0002", "23514"].includes(code)) {
        throw new CommercialHttpError(422, `Não foi possível excluir: ${technical}`);
      }
      if (code === "42501") throw new CommercialHttpError(403, "Não foi possível excluir: operação administrativa não autorizada.");
      throw new CommercialHttpError(500, "Não foi possível excluir: a transação no banco falhou. Consulte o log administrativo pelo UUID do aluno.");
    }
    if (name === "admin_mesclar_alunos") {
      console.error("Falha na mesclagem administrativa de alunos", {
        principal: params.p_principal, secundario: params.p_secundario, code, message: technical,
        details: result.error.details ?? null, hint: result.error.hint ?? null,
      });
      if (["22023", "P0002", "23503", "23505", "23514"].includes(code)) {
        throw new CommercialHttpError(422, `Não foi possível mesclar: ${technical}`);
      }
      if (code === "42883" || code === "PGRST202") throw new CommercialHttpError(503, "Não foi possível mesclar: a função de banco necessária não está disponível.");
      throw new CommercialHttpError(500, "Não foi possível mesclar. Consulte o log administrativo com os UUIDs informados.");
    }
    if (code === "23505") throw new CommercialHttpError(409, "Já existe um registro com esses dados.");
    if (["22023", "23503", "23514", "P0002"].includes(code)) {
      throw new CommercialHttpError(422, "Os dados informados não são válidos para esta operação.");
    }
    if (code === "42501") throw new CommercialHttpError(403, "Operação administrativa não autorizada.");
    throw new CommercialHttpError(500, "Não foi possível concluir a operação comercial.");
  }
  return result.data;
}

export async function readCommercialBody(request: Request): Promise<JsonObject> {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > 65536) throw new CommercialHttpError(413, "A requisição excede o limite permitido.");
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    throw new CommercialValidationError("JSON inválido.");
  }
  const body = asObject(parsed);
  if (JSON.stringify(body).length > 65536) throw new CommercialHttpError(413, "A requisição excede o limite permitido.");
  return body;
}

function paging(url: URL) {
  const page = pageFrom(url.searchParams.get("page"));
  const limit = limitFrom(url.searchParams.get("limit"));
  return { page, limit, from: (page - 1) * limit, to: page * limit - 1 };
}

function pageResult(data: unknown[], count: number | null, page: number, limit: number) {
  return { items: data, page, limit, total: count ?? 0, pages: Math.max(1, Math.ceil((count ?? 0) / limit)) };
}

async function loadPostSalePending(supabase = getSupabaseServerClient()) {
  const purchases = await supabase.from("compras").select("id,aluno_id,produto_id,adquirida_em,status_acesso,identificador_externo").eq("status_acesso", "ativo").not("aluno_id", "is", null).order("adquirida_em", { ascending: true }).order("id", { ascending: true });
  if (purchases.error) {
    logCommercialDbError("Falha ao carregar pendências do Mini-CRM", purchases.error, { etapa: "carregar_pendencias" });
    throw new CommercialHttpError(500, "Não foi possível carregar as pendências de pós-venda.");
  }
  const ids = (purchases.data ?? []).map((row) => row.id);
  const studentIds = [...new Set((purchases.data ?? []).map((row) => row.aluno_id).filter(Boolean))];
  const productIds = [...new Set((purchases.data ?? []).map((row) => row.produto_id).filter(Boolean))];
  const [manual, overrides, notices, students, products] = ids.length ? await Promise.all([
    supabase.from("compras_pos_venda").select("*").in("compra_id", ids),
    supabase.from("compras_pos_venda_overrides").select("compra_id,etapa,concluida_em,ator_user_id,observacao").in("compra_id", ids),
    supabase.from("alunos_notificacoes_acesso").select("aluno_id,idempotency_key,status,enviado_em,criado_em").in("aluno_id", studentIds),
    supabase.from("alunos").select("id,nome,email,telefone,primeiro_acesso_em").in("id", studentIds),
    productIds.length ? supabase.from("produtos").select("id,nome").in("id", productIds) : Promise.resolve({ data: [], error: null }),
  ]) : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }, { data: [], error: null }, { data: [], error: null }];
  if (students.error || products.error) {
    logCommercialDbError("Falha ao carregar dados de referência do Mini-CRM", students.error ?? products.error, { etapa: "carregar_referencias" });
    throw new CommercialHttpError(500, "Não foi possível carregar as pendências de pós-venda.");
  }
  const warnings: string[] = [];
  if (notices.error) {
    logCommercialDbError("Falha ao consultar notificações do Mini-CRM", notices.error, { etapa: "carregar_notificacoes" });
    warnings.push("Não foi possível confirmar os e-mails de acesso; a Etapa 3 foi mantida como pendente para revisão.");
  }
  if (manual.error && !isMissingPurchasePostSaleSchema(manual)) {
    logCommercialDbError("Falha ao carregar etapas manuais do Mini-CRM na fila", manual.error, { etapa: "carregar_schema_opcional" });
    throw new CommercialHttpError(500, "Não foi possível carregar as etapas manuais do pós-venda.");
  }
  if (manual.error) warnings.push("A migration 20260812130000_move_post_sale_to_purchases.sql precisa ser aplicada para concluir e registrar as etapas manuais.");
  if (overrides.error && !isMissingPurchasePostSaleSchema(overrides)) {
    logCommercialDbError("Falha ao carregar overrides do Mini-CRM na fila", overrides.error, { etapa: "carregar_overrides" });
    throw new CommercialHttpError(500, "Não foi possível carregar os overrides manuais do pós-venda.");
  }
  if (overrides.error) warnings.push("A migration de overrides manuais do Mini-CRM ainda não foi aplicada; as etapas 1 a 4 não podem ser confirmadas manualmente.");
  const manualBy = new Map((manual.data ?? []).map((row) => [row.compra_id, row]));
  const overridesByPurchase = new Map<string, number[]>();
  for (const row of overrides.data ?? []) overridesByPurchase.set(String(row.compra_id), [...(overridesByPurchase.get(String(row.compra_id)) ?? []), Number(row.etapa)]);
  const studentById = new Map((students.data ?? []).map((row) => [row.id, row]));
  const productById = new Map((products.data ?? []).map((row) => [row.id, row.nome]));
  const counts = [0, 0, 0, 0, 0, 0];
  const items = (purchases.data ?? []).map((purchase) => {
    const student = studentById.get(purchase.aluno_id) as { nome?: unknown; email?: unknown; telefone?: unknown; primeiro_acesso_em?: unknown } | undefined;
    const state = manualBy.get(purchase.id);
    const email = notices.error ? null : accessEmailForPurchase(notices.data ?? [], purchase);
    const stageState = postSaleStageState({ accessActive: purchase.status_acesso === "ativo", emailSent: email?.status === "enviado", firstAccessAt: student?.primeiro_acesso_em, stage5At: state?.etapa_5_concluida_em, stage6At: state?.etapa_6_concluida_em, overrides: overridesByPurchase.get(String(purchase.id)) ?? [] });
    const stages = stageState.etapas;
    const next = stages.findIndex((done) => !done) + 1;
    if (next) counts[next - 1] += 1;
    return { compra_id: purchase.id, aluno_id: purchase.aluno_id, nome: student?.nome ?? null, email: student?.email ?? null, telefone: student?.telefone ?? null, produto: productById.get(purchase.produto_id) ?? "Produto", adquirida_em: purchase.adquirida_em, proxima_etapa: next, etapa_titulo: next ? ["Compra registrada", "Acesso liberado", "E-mail de acesso", "Primeiro acesso", "Confirmar acesso com o cliente", "Confirmar flashcards e Anki"][next - 1] : null, etapas: stages };
  }).filter((item) => item.proxima_etapa > 0);
  return { items, visibleItems: items.slice(0, 5), counts, warnings, unavailable: Boolean(manual.error || overrides.error), message: warnings[0] ?? null, resumo: { total: items.length, etapa_1: counts[0], etapa_2: counts[1], etapa_3: counts[2], etapa_4: counts[3], etapa_5: counts[4], etapa_6: counts[5] } };
}

export async function getCommercialResource(resource: CommercialResource, request: Request) {
  await requireAdmin();
  const supabase = getSupabaseServerClient();
  const url = new URL(request.url);
  const q = safeSearch(url.searchParams.get("q"));
  const { page, limit, from, to } = paging(url);

  if (resource === "alunos") {
    const filter = url.searchParams.get("filtro") ?? "todos";
    if (!["todos", "com_auth", "sem_auth", "duplicados", "entrou_hoje", "ultimos_7_dias", "ultimos_30_dias", "nunca_entrou"].includes(filter)) throw new CommercialValidationError("Filtro de alunos inválido.");
    const [result, summary, crm] = await Promise.all([
      supabase.rpc("admin_listar_alunos", { p_q: q, p_filtro: filter, p_limit: limit, p_offset: from }),
      supabase.rpc("admin_resumo_acessos_alunos"),
      loadPostSalePending(supabase),
    ]);
    assertQuery(result);
    assertQuery(summary);
    const items = (result.data ?? []) as Record<string, unknown>[];
    const userIds = items.map((item) => String(item.user_id ?? "")).filter(Boolean);
    const profiles = userIds.length ? await supabase.from("perfis_publicos").select("id,nome_publico").in("id", userIds) : { data: [], error: null };
    assertQuery(profiles);
    const names = new Map((profiles.data ?? []).map((profile) => [String(profile.id), profile.nome_publico]));
    for (const item of items) item.nome_publico = names.get(String(item.user_id ?? "")) ?? null;
    const total = Number(items[0]?.total_count ?? 0);
    return { ...pageResult(items, total, page, limit), resumo_acessos: summary.data?.[0] ?? { total_alunos: 0, com_auth: 0, entraram_hoje: 0, ultimos_7_dias: 0, nunca_entraram: 0 }, crm_pendencias: crm.items, crm_pendencias_exibidas: crm.visibleItems, crm_resumo: crm.resumo, crm_avisos: crm.warnings };
  }

  if (resource === "anki_tutoriais") {
    const result = await supabase
      .from("configuracao_anki_tutoriais")
        .select("id,computador_app_url,computador_tutorial_url,android_app_url,android_tutorial_url,ios_app_url,ios_tutorial_url,navegador_app_url,navegador_tutorial_url,computador_estudo_url,android_estudo_url,ios_estudo_url,navegador_estudo_url,updated_at")
      .eq("id", 1)
      .maybeSingle();
    assertQuery(result);
    return pageResult(result.data ? [result.data] : [], result.data ? 1 : 0, 1, 1);
  }

  if (resource === "leis") {
    let query = supabase.from("leis").select("*", { count: "exact" });
    if (q) query = query.or(`slug.ilike.%${q}%,titulo.ilike.%${q}%,nome_curto.ilike.%${q}%,codigo.ilike.%${q}%`);
    const ativo = url.searchParams.get("ativo");
    if (ativo === "true" || ativo === "false") query = query.eq("ativo", ativo === "true");
    const result = await query.order("ordem").order("id").range(from, to);
    assertQuery(result);
    return pageResult(result.data ?? [], result.count, page, limit);
  }

  if (resource === "materiais") {
    let query = supabase.from("materiais_leis").select("*,leis(id,slug,titulo)", { count: "exact" });
    if (q) query = query.or(`titulo.ilike.%${q}%,descricao.ilike.%${q}%`);
    const leiId = url.searchParams.get("lei_id");
    if (leiId) query = query.eq("lei_id", positiveIntegerId(leiId, "Lei"));
    const result = await query.order("lei_id").order("ordem").range(from, to);
    assertQuery(result);
    return pageResult(result.data ?? [], result.count, page, limit);
  }

  if (resource === "atualizacoes") {
    let query = supabase
      .from("historico_atualizacoes_leis")
      .select("*,leis(id,slug,titulo),materiais_leis(id,titulo,tipo,versao_material)", { count: "exact" });
    if (q) query = query.or(`titulo.ilike.%${q}%,descricao_resumida.ilike.%${q}%,referencia_normativa.ilike.%${q}%`);
    const leiId = url.searchParams.get("lei_id");
    const tipo = safeSearch(url.searchParams.get("tipo"), 60);
    const importancia = safeSearch(url.searchParams.get("importancia"), 30);
    if (leiId) query = query.eq("lei_id", positiveIntegerId(leiId, "Lei"));
    if (tipo) query = query.eq("tipo", enumValue(tipo, EDITORIAL_UPDATE_TYPES, "Tipo"));
    if (importancia) query = query.eq("importancia", enumValue(importancia, EDITORIAL_IMPORTANCE, "Importância"));
    const result = await query.order("data_publicacao", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }).range(from, to);
    assertQuery(result);
    return pageResult(result.data ?? [], result.count, page, limit);
  }

  if (resource === "produtos") {
    let query = supabase.from("produtos").select("*", { count: "exact" });
    if (q) query = query.or(`nome.ilike.%${q}%,slug.ilike.%${q}%,hotmart_product_id.ilike.%${q}%`);
    const result = await query.order("ordem").order("nome").range(from, to);
    assertQuery(result);
    const uniqueProducts = new Map<string, (typeof result.data extends (infer Row)[] | null ? Row : never)>();
    for (const product of result.data ?? []) {
      const id = String(product.id);
      if (uniqueProducts.has(id)) console.warn("Produto duplicado descartado na agregação administrativa", { id });
      else uniqueProducts.set(id, product);
    }
    const productRows = [...uniqueProducts.values()];
    const ids = productRows.map((row) => String(row.id));
    const links = ids.length
      ? await supabase.from("produto_leis").select("produto_id,lei_id,ordem,leis(id,slug,titulo)").in("produto_id", ids).order("ordem")
      : { data: [], error: null };
    assertQuery(links);
    const byProduct = new Map<string, unknown[]>();
    const lawsByProduct = new Map<string, Set<string>>();
    for (const link of links.data ?? []) {
      const key = String(link.produto_id);
      const lawId = String(link.lei_id);
      const lawIds = lawsByProduct.get(key) ?? new Set<string>();
      if (!lawIds.has(lawId)) byProduct.set(key, [...(byProduct.get(key) ?? []), link]);
      lawIds.add(lawId); lawsByProduct.set(key, lawIds);
    }
    return pageResult(productRows.map((row) => ({ ...row, leis: byProduct.get(String(row.id)) ?? [] })), productRows.length, page, limit);
  }

  if (resource === "aquisicoes") {
    let query = supabase.from("compras").select("*,alunos(id,nome,email),produtos(id,nome,slug)", { count: "exact" });
    const status = safeSearch(url.searchParams.get("status"), 30);
    const origem = safeSearch(url.searchParams.get("origem"), 30);
    const alunoId = url.searchParams.get("aluno_id");
    const produtoId = url.searchParams.get("produto_id");
    if (status) query = query.eq("status_acesso", status);
    if (origem) query = query.eq("origem", origem);
    if (alunoId) query = query.eq("aluno_id", uuid(alunoId, "Aluno"));
    if (produtoId) query = query.eq("produto_id", uuid(produtoId, "Produto"));
    if (q) query = query.or(`identificador_externo.ilike.%${q}%,observacao_administrativa.ilike.%${q}%`);
    const result = await query.order("criado_em", { ascending: false }).range(from, to);
    assertQuery(result);
    return pageResult(result.data ?? [], result.count, page, limit);
  }

  if (resource === "liberacoes") {
    let query = supabase.from("liberacoes_leis").select("*,alunos(id,nome,email),leis(id,slug,titulo),produtos(id,nome),compras(id,origem,identificador_externo)", { count: "exact" });
    const alunoId = url.searchParams.get("aluno_id");
    const leiId = url.searchParams.get("lei_id");
    const produtoId = url.searchParams.get("produto_id");
    const status = safeSearch(url.searchParams.get("status"), 30);
    if (alunoId) query = query.eq("aluno_id", uuid(alunoId, "Aluno"));
    if (leiId) query = query.eq("lei_id", positiveIntegerId(leiId, "Lei"));
    if (produtoId) query = query.eq("produto_id", uuid(produtoId, "Produto"));
    if (status) query = query.eq("status", status);
    const result = await query.order("concedida_em", { ascending: false }).range(from, to);
    assertQuery(result);
    const studentIds = [...new Set((result.data ?? []).map((row) => String(row.aluno_id)))];
    const lawIds = [...new Set((result.data ?? []).map((row) => Number(row.lei_id)))];
    const activeSources = studentIds.length && lawIds.length
      ? await supabase.from("liberacoes_leis").select("aluno_id,lei_id").eq("status", "ativo").in("aluno_id", studentIds).in("lei_id", lawIds)
      : { data: [], error: null };
    assertQuery(activeSources);
    const activeCounts = new Map<string, number>();
    for (const row of activeSources.data ?? []) {
      const key = `${row.aluno_id}:${row.lei_id}`;
      activeCounts.set(key, (activeCounts.get(key) ?? 0) + 1);
    }
    return pageResult((result.data ?? []).map((row) => ({
      ...row,
      outras_fontes_ativas: Math.max(0, (activeCounts.get(`${row.aluno_id}:${row.lei_id}`) ?? 0) - (row.status === "ativo" ? 1 : 0)),
    })), result.count, page, limit);
  }

  let query = supabase.from("auditoria_administrativa").select("*", { count: "exact" });
  const actor = url.searchParams.get("ator_user_id");
  const action = safeSearch(url.searchParams.get("acao"), 80);
  const entity = safeSearch(url.searchParams.get("entidade"), 80);
  const fromDate = url.searchParams.get("de");
  const toDate = url.searchParams.get("ate");
  if (actor) query = query.eq("ator_user_id", uuid(actor, "Ator"));
  if (action) query = query.eq("acao", action);
  if (entity) query = query.eq("entidade", entity);
  if (fromDate) query = query.gte("created_at", fromDate);
  if (toDate) query = query.lte("created_at", toDate);
  const result = await query.order("created_at", { ascending: false }).range(from, to);
  assertQuery(result);
  return pageResult(result.data ?? [], result.count, page, limit);
}

function allowedUpdate(data: unknown, allowed: readonly string[]): JsonObject {
  const object = asObject(data);
  rejectUnknownKeys(object, allowed);
  if (!Object.keys(object).length) throw new CommercialValidationError("Informe ao menos um campo para atualizar.");
  return object;
}

function validateLawData(raw: unknown, update = false) {
  const allowed = [
    "slug", "titulo", "nome_curto", "descricao", "codigo", "categoria", "ativo", "ordem", "thumbnail_url",
    "norma_originaria_referencia", "norma_originaria_data", "houve_alteracao_legislativa",
    "ultima_alteracao_referencia", "ultima_alteracao_data", "situacao_atualizacao",
  ] as const;
  const data = update ? allowedUpdate(raw, allowed) : asObject(raw);
  rejectUnknownKeys(data, allowed);
  const result: JsonObject = {};
  if (!update || "slug" in data) result.slug = slug(data.slug);
  if (!update || "titulo" in data) result.titulo = requiredString(data.titulo, "Título", 300);
  for (const key of ["nome_curto", "descricao", "codigo", "categoria", "thumbnail_url"] as const) {
    if (!update || key in data) {
      const value = optionalString(data[key], key, key === "descricao" ? 4000 : 500);
      result[key] = update ? value : value ?? null;
    }
  }
  if (!update || "ativo" in data) result.ativo = booleanValue(data.ativo ?? true, "Ativo");
  if (!update || "ordem" in data) result.ordem = nonNegativeInteger(data.ordem, "Ordem", 0);
  if (!update || "norma_originaria_referencia" in data) result.norma_originaria_referencia = optionalString(data.norma_originaria_referencia, "Norma originária", 500) ?? null;
  if (!update || "norma_originaria_data" in data) result.norma_originaria_data = optionalIsoDate(data.norma_originaria_data, "Data da norma originária") ?? null;
  if (!update || "houve_alteracao_legislativa" in data) result.houve_alteracao_legislativa = booleanValue(data.houve_alteracao_legislativa ?? false, "Alteração legislativa");
  if (!update || "ultima_alteracao_referencia" in data) result.ultima_alteracao_referencia = optionalString(data.ultima_alteracao_referencia, "Última alteração", 500) ?? null;
  if (!update || "ultima_alteracao_data" in data) result.ultima_alteracao_data = optionalIsoDate(data.ultima_alteracao_data, "Data da última alteração") ?? null;
  if (!update || "situacao_atualizacao" in data) result.situacao_atualizacao = enumValue(data.situacao_atualizacao ?? "revisao_pendente", LAW_UPDATE_STATUSES, "Situação de atualização");
  return result;
}

function validateMaterialData(raw: unknown, update = false) {
  const allowed = [
    "lei_id", "tipo", "titulo", "descricao", "provedor", "url_externa", "acao", "ordem", "ativo",
    "quantidade_itens", "versao_material", "revisado_em", "publicado_em", "observacao_interna",
  ] as const;
  const data = update ? allowedUpdate(raw, allowed.filter((key) => key !== "lei_id")) : asObject(raw);
  rejectUnknownKeys(data, update ? allowed.filter((key) => key !== "lei_id") : allowed);
  const result: JsonObject = {};
  if (!update) result.lei_id = positiveIntegerId(data.lei_id, "Lei");
  if (!update || "tipo" in data) result.tipo = enumValue(data.tipo, MATERIAL_TYPES, "Tipo");
  if (!update || "titulo" in data) result.titulo = requiredString(data.titulo, "Título", 300);
  if (!update || "descricao" in data) {
    const value = optionalString(data.descricao, "Descrição", 4000);
    result.descricao = update ? value : value ?? null;
  }
  if (!update || "provedor" in data) result.provedor = enumValue(data.provedor, MATERIAL_PROVIDERS, "Provedor");
  if (!update || "url_externa" in data) result.url_externa = requiredString(data.url_externa, "URL externa", 4000);
  if (!update || "acao" in data) result.acao = enumValue(data.acao, MATERIAL_ACTIONS, "Ação");
  if (!update || "ordem" in data) result.ordem = nonNegativeInteger(data.ordem, "Ordem", 0);
  if (!update || "ativo" in data) result.ativo = booleanValue(data.ativo ?? true, "Ativo");
  if (!update || "quantidade_itens" in data) result.quantidade_itens = optionalNonNegativeInteger(data.quantidade_itens, "Quantidade de itens") ?? null;
  if (!update || "versao_material" in data) result.versao_material = optionalString(data.versao_material, "Versão do material", 100) ?? null;
  if (!update || "revisado_em" in data) result.revisado_em = optionalIsoDate(data.revisado_em, "Data de revisão") ?? null;
  if (!update || "publicado_em" in data) result.publicado_em = optionalIsoDate(data.publicado_em, "Data de publicação") ?? null;
  if (!update || "observacao_interna" in data) result.observacao_interna = optionalString(data.observacao_interna, "Observação interna", 4000) ?? null;
  return result;
}

function validateEditorialUpdateData(raw: unknown, update = false) {
  const allowed = [
    "lei_id", "material_lei_id", "tipo", "importancia", "titulo", "descricao_resumida", "referencia_normativa",
    "data_referencia_normativa", "versao_anterior", "versao_nova", "quantidade_flashcards_anterior",
    "quantidade_flashcards_nova", "quantidade_questoes_adicionadas", "quantidade_questoes_corrigidas",
    "quantidade_flashcards_revisados", "visivel_aluno", "visivel_catalogo", "observacao_interna", "data_publicacao",
  ] as const;
  const updateAllowed = allowed.filter((key) => key !== "lei_id");
  const data = update ? allowedUpdate(raw, updateAllowed) : asObject(raw);
  rejectUnknownKeys(data, update ? updateAllowed : allowed);
  const result: JsonObject = {};
  if (!update) result.lei_id = positiveIntegerId(data.lei_id, "Lei");
  if (!update || "material_lei_id" in data) result.material_lei_id = data.material_lei_id == null || data.material_lei_id === "" ? null : positiveIntegerId(data.material_lei_id, "Material");
  if (!update || "tipo" in data) result.tipo = enumValue(data.tipo, EDITORIAL_UPDATE_TYPES, "Tipo");
  if (!update || "importancia" in data) result.importancia = enumValue(data.importancia, EDITORIAL_IMPORTANCE, "Importância");
  if (!update || "titulo" in data) result.titulo = requiredString(data.titulo, "Título", 300);
  for (const key of ["descricao_resumida", "referencia_normativa", "versao_anterior", "versao_nova", "observacao_interna"] as const) {
    if (!update || key in data) result[key] = optionalString(data[key], key, key === "descricao_resumida" || key === "observacao_interna" ? 4000 : 500) ?? null;
  }
  if (!update || "data_referencia_normativa" in data) result.data_referencia_normativa = optionalIsoDate(data.data_referencia_normativa, "Data da referência normativa") ?? null;
  for (const key of ["quantidade_flashcards_anterior", "quantidade_flashcards_nova", "quantidade_questoes_adicionadas", "quantidade_questoes_corrigidas", "quantidade_flashcards_revisados"] as const) {
    if (!update || key in data) result[key] = optionalNonNegativeInteger(data[key], key) ?? null;
  }
  if (!update || "visivel_aluno" in data) result.visivel_aluno = booleanValue(data.visivel_aluno ?? true, "Visível ao aluno");
  if (!update || "visivel_catalogo" in data) result.visivel_catalogo = booleanValue(data.visivel_catalogo ?? false, "Visível no catálogo");
  if (!update || "data_publicacao" in data) result.data_publicacao = optionalTimestamp(data.data_publicacao, "Data de publicação") ?? null;
  return result;
}

function validateProductData(raw: unknown, update = false) {
  const allowed = ["nome", "slug", "descricao", "tipo_produto", "hotmart_url", "hotmart_product_id", "video_demo_url", "destaque", "ordem", "ativo", "observacao_administrativa"] as const;
  const data = update ? allowedUpdate(raw, allowed) : asObject(raw);
  rejectUnknownKeys(data, allowed);
  const result: JsonObject = {};
  if (!update || "nome" in data) result.nome = requiredString(data.nome, "Nome", 300);
  if (!update || "slug" in data) result.slug = slug(data.slug);
  if (!update || "descricao" in data) {
    const value = optionalString(data.descricao, "Descrição", 4000);
    result.descricao = update ? value : value ?? null;
  }
  if (!update || "tipo_produto" in data) result.tipo_produto = enumValue(data.tipo_produto, PRODUCT_TYPES, "Tipo do produto");
  if (!update || "hotmart_url" in data) {
    const value = optionalString(data.hotmart_url, "URL da Hotmart", 2000);
    result.hotmart_url = update ? value : value ?? null;
  }
  if (!update || "hotmart_product_id" in data) {
    const value = optionalString(data.hotmart_product_id, "ID Hotmart", 300);
    result.hotmart_product_id = update ? value : value ?? null;
  }
  if (!update || "video_demo_url" in data) {
    const value = optionalProductDemoVideoUrl(data.video_demo_url, "URL do vídeo de demonstração");
    result.video_demo_url = update ? value : value ?? null;
  }
  if (!update || "destaque" in data) result.destaque = booleanValue(data.destaque ?? false, "Destaque na página inicial");
  if (!update || "ordem" in data) result.ordem = nonNegativeInteger(data.ordem, "Ordem", 0);
  if (!update || "ativo" in data) result.ativo = booleanValue(data.ativo ?? true, "Ativo");
  if (!update || "observacao_administrativa" in data) {
    const value = optionalString(data.observacao_administrativa, "Observação", 4000);
    result.observacao_administrativa = update ? value : value ?? null;
  }
  return result;
}

function validateStudentData(raw: unknown) {
  const data = asObject(raw);
  rejectUnknownKeys(data, ["nome", "email", "telefone"]);
  const email = requiredString(data.email, "E-mail", 320).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new CommercialValidationError("E-mail inválido.");
  return {
    nome: optionalString(data.nome, "Nome", 300) ?? null,
    email,
    telefone: optionalString(data.telefone, "Telefone", 80) ?? null,
  };
}

function provisionalPassword() {
  return `${randomBytes(18).toString("base64url")}Aa1!`;
}

async function findAuthUserByEmail(email: string) {
  const supabase = getSupabaseServerClient();
  for (let page = 1; page <= 100; page += 1) {
    const listed = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (listed.error) throw listed.error;
    const user = listed.data.users.find((item) => item.email?.trim().toLowerCase() === email);
    if (user) return user;
    if (listed.data.users.length < 1000) return null;
  }
  throw new CommercialHttpError(500, "Não foi possível localizar a conta Auth pelo e-mail.");
}

function validateAnkiTutorialSettings(raw: unknown) {
  const fields = [
    "computador_app_url", "computador_tutorial_url",
    "android_app_url", "android_tutorial_url",
    "ios_app_url", "ios_tutorial_url",
    "navegador_app_url", "navegador_tutorial_url",
    "computador_estudo_url", "android_estudo_url", "ios_estudo_url", "navegador_estudo_url",
  ] as const;
  const data = asObject(raw);
  rejectUnknownKeys(data, fields);
  const result: JsonObject = {};
  for (const field of fields) result[field] = optionalString(data[field], "URL", 2000) ?? null;
  return result;
}

type HistoricalSale = { transactionId: string; productCode: string; email: string; name: string | null; phone: string | null; purchasedAt: string; status: HistoricalSaleStatus };

function parseHistoricalTimestamp(value: string) {
  const brazilian = value.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  const normalized = brazilian
    ? `${brazilian[3]}-${brazilian[2]}-${brazilian[1]}T${brazilian[4] ?? "00"}:${brazilian[5] ?? "00"}:${brazilian[6] ?? "00"}-03:00`
    : value;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function historicalSale(raw: unknown): HistoricalSale {
  const row = asObject(raw);
  rejectUnknownKeys(row, ["transactionId", "productCode", "email", "name", "phone", "purchasedAt", "status"]);
  const mappedStatus = normalizeHistoricalHotmartStatus(row.status);
  const purchasedAt = parseHistoricalTimestamp(requiredString(row.purchasedAt, "Data da transação", 100));
  if (!purchasedAt) throw new CommercialValidationError("Data da transação inválida.");
  return {
    transactionId: requiredString(row.transactionId, "Código da transação", 300),
    productCode: requiredString(row.productCode, "Código do produto", 300),
    email: requiredString(row.email, "E-mail", 320).toLowerCase(),
    name: optionalString(row.name, "Nome", 300) ?? null,
    phone: optionalString(row.phone, "Telefone", 80) ?? null,
    purchasedAt,
    status: mappedStatus,
  };
}

async function importHistoricalHotmartSales(actor: string, rawRows: unknown, dryRun = false) {
  if (!Array.isArray(rawRows) || !rawRows.length || rawRows.length > 50) throw new CommercialValidationError("Informe de 1 a 50 vendas por lote.");
  const supabase = getSupabaseServerClient();
  const summary = { processed: rawRows.length, imported: 0, ready: 0, studentsCreated: 0, studentsExisting: 0, duplicates: 0, errors: [] as string[] };
  for (let index = 0; index < rawRows.length; index += 1) {
    try {
      const sale = historicalSale(rawRows[index]);
      const duplicate = await supabase.from("compras").select("id").eq("origem", "hotmart").eq("identificador_externo", sale.transactionId).maybeSingle();
      if (duplicate.error) throw duplicate.error;
      if (duplicate.data) { summary.duplicates += 1; continue; }
      const product = await supabase.from("produtos").select("id,hotmart_product_id,ativo").eq("hotmart_product_id", sale.productCode).maybeSingle();
      if (product.error || !product.data) throw new Error("Produto interno não encontrado para o código Hotmart.");
      if (dryRun) { summary.ready += 1; continue; }
      const imported = await rpc("admin_importar_aquisicao_hotmart_historica", {
        p_ator_user_id: actor, p_email: sale.email, p_nome: sale.name, p_telefone: sale.phone,
        p_hotmart_product_id: sale.productCode, p_transaction_id: sale.transactionId,
        p_adquirida_em: sale.purchasedAt, p_status_acesso: sale.status,
      }) as { duplicada?: boolean; aluno_criado?: boolean } | null;
      if (imported?.duplicada) { summary.duplicates += 1; continue; }
      summary.imported += 1;
      if (imported?.aluno_criado) summary.studentsCreated += 1;
      else summary.studentsExisting += 1;
    } catch (error) {
      const raw = error instanceof Error ? error.message : typeof error === "object" && error !== null && "message" in error && typeof error.message === "string" ? error.message : "Falha não identificada pelo Supabase.";
      summary.errors.push(`Linha ${index + 1}: ${raw.replace(/[\r\n]+/g, " ").slice(0, 500)}`);
    }
  }
  return summary;
}

export async function mutateCommercialResource(resource: CommercialResource, request: Request) {
  const admin = await requireAdmin();
  const actor = uuid(admin.id, "Administrador");
  const body = await readCommercialBody(request);
  const action = requiredString(body.action, "Ação", 40);
  rejectUnknownKeys(body, ["action", "id", "data", "lei_ids"]);

  if (resource === "alunos" && action === "crm_compras") {
    const alunoId = uuid(body.id, "Aluno"); const supabase = getSupabaseServerClient();
    const [student, purchases] = await Promise.all([
      supabase.from("alunos").select("primeiro_acesso_em,ultimo_acesso_em").eq("id", alunoId).maybeSingle(),
      supabase.from("compras").select("id,produto_id,adquirida_em,status_acesso,origem,identificador_externo").eq("aluno_id", alunoId).eq("status_acesso", "ativo").order("adquirida_em", { ascending: false }),
    ]);
    if (student.error || !student.data || purchases.error) {
      logCommercialDbError("Falha ao carregar o Mini-CRM por compra", student.error ?? purchases.error, { alunoId, etapa: "carregar_compras" });
      throw new CommercialHttpError(500, "Não foi possível carregar as compras do pós-venda.");
    }
    const studentData = student.data;
    const ids = (purchases.data ?? []).map((p) => p.id);
    const [products, manualRows, overrideRows, historyRows, notices, releases] = ids.length
      ? await Promise.all([
        supabase.from("produtos").select("id,nome").in("id", [...new Set((purchases.data ?? []).map((purchase) => purchase.produto_id).filter(Boolean))]),
        supabase.from("compras_pos_venda").select("*").in("compra_id", ids),
        supabase.from("compras_pos_venda_overrides").select("compra_id,etapa,concluida_em,ator_user_id,observacao").in("compra_id", ids),
        supabase.from("compras_pos_venda_historico").select("*").in("compra_id", ids).order("created_at", { ascending: false }),
        supabase.from("alunos_notificacoes_acesso").select("aluno_id,idempotency_key,status,enviado_em,criado_em,erro").eq("aluno_id", alunoId),
        supabase.from("liberacoes_leis").select("id,compra_id,origem,status,concedida_em,leis(titulo)").in("compra_id", ids).eq("status", "ativo"),
      ])
      : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }, { data: [], error: null }, { data: [], error: null }, { data: [], error: null }];
    if (products.error) {
      logCommercialDbError("Falha ao carregar produtos do Mini-CRM por compra", products.error, { alunoId, etapa: "carregar_produtos" });
      throw new CommercialHttpError(500, "Não foi possível carregar as compras do pós-venda.");
    }
    if (manualRows.error || historyRows.error) {
      const error = manualRows.error ?? historyRows.error;
      logCommercialDbError("Falha ao carregar dados manuais do Mini-CRM por compra", error, { alunoId, etapa: "carregar_crm" });
      if (isMissingPurchasePostSaleSchema({ error })) {
        throw new CommercialHttpError(503, "A migration do Mini-CRM por compra ainda não foi aplicada.");
      }
      throw new CommercialHttpError(500, "Não foi possível carregar as etapas manuais do pós-venda.");
    }
    if (overrideRows.error && !isMissingPurchasePostSaleSchema(overrideRows)) {
      logCommercialDbError("Falha ao carregar overrides manuais do Mini-CRM", overrideRows.error, { alunoId, etapa: "carregar_overrides" });
      throw new CommercialHttpError(500, "Não foi possível carregar os overrides manuais do pós-venda.");
    }
    if (notices.error) {
      logCommercialDbError("Falha ao carregar notificações do Mini-CRM por compra", notices.error, { alunoId, etapa: "carregar_notificacoes" });
      throw new CommercialHttpError(500, "Não foi possível carregar as compras do pós-venda.");
    }
    if (releases.error) {
      logCommercialDbError("Falha ao carregar liberações do Mini-CRM por compra", releases.error, { alunoId, etapa: "carregar_liberacoes" });
      throw new CommercialHttpError(500, "Não foi possível carregar as liberações do pós-venda.");
    }
    const manualBy = new Map((manualRows.data ?? []).map((row) => [row.compra_id, row]));
    const overridesByPurchase = new Map<string, Record<string, unknown>[]>();
    for (const row of overrideRows.data ?? []) overridesByPurchase.set(String(row.compra_id), [...(overridesByPurchase.get(String(row.compra_id)) ?? []), row]);
    const productById = new Map((products.data ?? []).map((row) => [row.id, row.nome]));
    const cycles = (purchases.data ?? []).map((purchase) => {
      const email = accessEmailForPurchase(notices.data ?? [], purchase);
      const state = manualBy.get(purchase.id); const emailSent = email?.status === "enviado";
      const overrideRowsForPurchase = overridesByPurchase.get(String(purchase.id)) ?? [];
      const stageState = postSaleStageState({ accessActive: purchase.status_acesso === "ativo", emailSent, firstAccessAt: studentData.primeiro_acesso_em, stage5At: state?.etapa_5_concluida_em, stage6At: state?.etapa_6_concluida_em, overrides: overrideRowsForPurchase.map((row) => Number(row.etapa)) });
      const stages = stageState.etapas;
      const next = stages.findIndex((done) => !done) + 1;
      return { ...purchase, produtos: { nome: productById.get(purchase.produto_id) ?? "Produto" }, etapas: stages, etapas_automaticas: stageState.automaticas, etapas_manuais: stageState.manuais, proxima_etapa: next || 6, historico: (historyRows.data ?? []).filter((row) => row.compra_id === purchase.id), overrides: overrideRowsForPurchase, email, liberacoes: (releases.data ?? []).filter((row) => row.compra_id === purchase.id), primeiro_acesso_em: studentData.primeiro_acesso_em, override_schema_disponivel: !overrideRows.error };
    });
    return { cycles };
  }
  if (resource === "alunos" && action === "crm_pendencias") {
    const crm = await loadPostSalePending();
    return { unavailable: crm.unavailable, message: crm.message, items: crm.items, items_exibidos: crm.visibleItems, counts: crm.counts, resumo: crm.resumo, avisos: crm.warnings };
  }
  if (resource === "alunos" && action === "crm_compra_atualizar") {
    const compraId = uuid(body.id, "Compra"); const data = asObject(body.data); rejectUnknownKeys(data, ["etapa", "acao", "observacao"]);
    const etapa = Number(data.etapa); if (!Number.isInteger(etapa) || etapa < 1 || etapa > 6) throw new CommercialValidationError("Etapa manual inválida.");
    const acao = data.acao === "reabrir" ? "reabrir" : "concluir";
    const supabase = getSupabaseServerClient(); const now = new Date().toISOString();
    const saved = acao === "concluir"
      ? await supabase.from("compras_pos_venda_overrides").upsert({ compra_id: compraId, etapa, concluida_em: now, ator_user_id: actor, observacao: optionalString(data.observacao, "Observação", 2000) ?? null, updated_at: now }, { onConflict: "compra_id,etapa" })
      : await supabase.from("compras_pos_venda_overrides").delete().eq("compra_id", compraId).eq("etapa", etapa);
    if (saved.error) {
      logCommercialDbError("Falha ao salvar override manual do Mini-CRM por compra", saved.error, { compraId, etapa, acao });
      if (isMissingPurchasePostSaleSchema(saved)) {
        throw new CommercialHttpError(503, "A migration de overrides manuais do Mini-CRM ainda não foi aplicada.");
      }
      throw new CommercialHttpError(500, "Não foi possível salvar a etapa manual do pós-venda.");
    }
    if (acao === "reabrir" && etapa >= 5) {
      const legacy = await supabase.from("compras_pos_venda").upsert({ compra_id: compraId, [`etapa_${etapa}_concluida_em`]: null, updated_at: now }, { onConflict: "compra_id" });
      if (legacy.error && !isMissingPurchasePostSaleSchema(legacy)) throw new CommercialHttpError(500, "Não foi possível reabrir a etapa manual do pós-venda.");
    }
    const event = await supabase.from("compras_pos_venda_historico").insert({ compra_id: compraId, ator_user_id: actor, etapa, acao: acao === "concluir" ? `etapa_${etapa}_concluida_manual` : `etapa_${etapa}_reaberta_manual`, observacao: optionalString(data.observacao, "Observação", 2000) ?? null }); assertQuery(event); return { ok: true };
  }

  if (resource === "alunos" && action === "crm_detalhe") {
    const alunoId = uuid(body.id, "Aluno");
    const supabase = getSupabaseServerClient();
    const [student, purchases, crm, notifications, manualEmails, history] = await Promise.all([
      supabase.from("alunos").select("id,user_id,nome,email,telefone,primeiro_acesso_em,ultimo_acesso_em,total_logins").eq("id", alunoId).maybeSingle(),
      supabase.from("compras").select("produto_id,status_acesso").eq("aluno_id", alunoId).eq("status_acesso", "ativo"),
      supabase.from("alunos_pos_venda").select("*").eq("aluno_id", alunoId).maybeSingle(),
      supabase.from("alunos_notificacoes_acesso").select("status,enviado_em,criado_em,erro").eq("aluno_id", alunoId).order("criado_em", { ascending: false }).limit(1),
      supabase.from("auditoria_administrativa").select("created_at,acao,detalhes").eq("entidade", "aluno").eq("entidade_id", alunoId).eq("acao", "email_acesso_manual_enviado").order("created_at", { ascending: false }).limit(1),
      supabase.from("alunos_pos_venda_historico").select("id,acao,status,observacao,created_at").eq("aluno_id", alunoId).order("created_at", { ascending: false }).limit(30),
    ]);
    if (student.error || !student.data) throw new CommercialHttpError(404, "Aluno não encontrado.");
    for (const result of [purchases, notifications, manualEmails]) assertQuery(result);
    const crmUnavailable = isMissingPostSaleSchema(crm) || isMissingPostSaleSchema(history);
    if (!crmUnavailable) { assertQuery(crm); assertQuery(history); }
    const posVenda = crm.data ?? { uso_questoes_status: "nao_confirmado" };
    const email = (notifications.data?.[0] ?? manualEmails.data?.[0] ?? null) as { status?: string; enviado_em?: string; criado_em?: string; created_at?: string } | null;
    const temAcesso = (purchases.data?.length ?? 0) > 0;
    const uso = String(posVenda.uso_questoes_status ?? "nao_confirmado");
    const concluidas = Number(temAcesso) + Number(email?.status === "enviado" || Boolean(email && "created_at" in email)) + Number(Boolean(student.data.primeiro_acesso_em)) + Number(Boolean(posVenda.whatsapp_enviado_em)) + Number(uso === "conseguiu_utilizar" || uso === "problema_resolvido") + Number(Boolean(posVenda.suporte_inicial_concluido_em));
    const proximaAcao = !temAcesso ? "Liberar acesso" : !(email?.status === "enviado" || Boolean(email && "created_at" in email)) ? "Verificar envio do e-mail" : !student.data.primeiro_acesso_em ? "Aguardar primeiro acesso" : !posVenda.whatsapp_enviado_em ? "Enviar WhatsApp" : uso === "precisa_ajuda" ? "Prestar suporte" : uso === "nao_confirmado" ? "Confirmar uso das questões" : "Pós-venda concluído";
    const profile = student.data.user_id ? await supabase.from("perfis_publicos").select("nome_publico").eq("id", student.data.user_id).maybeSingle() : { data: null, error: null };
    assertQuery(profile);
    return { ...student.data, nome_publico: profile.data?.nome_publico ?? null, pos_venda: posVenda, historico: history.data ?? [], crm_disponivel: !crmUnavailable, crm_mensagem: crmUnavailable ? "O Mini-CRM está pronto na interface, mas a migration 20260812100000_create_student_post_sale_crm.sql ainda precisa ser aplicada para registrar o checklist e o histórico." : null, tem_acesso: temAcesso, produtos_ativos: purchases.data?.length ?? 0, email_status: email?.status ?? (email ? "enviado" : ""), email_em: email?.enviado_em ?? email?.created_at ?? null, concluidas, total_etapas: 6, proxima_acao: proximaAcao };
  }
  if (resource === "alunos" && action === "atualizar_ficha") {
    const alunoId = uuid(body.id, "Aluno"); const data = asObject(body.data);
    rejectUnknownKeys(data, ["nome", "telefone", "nome_publico"]);
    const nome = optionalString(data.nome, "Nome completo", 300) ?? null;
    const telefone = optionalString(data.telefone, "Telefone", 80) ?? null;
    const nomePublico = optionalString(data.nome_publico, "Nome público", 50) ?? null;
    const supabase = getSupabaseServerClient();
    const current = await supabase.from("alunos").select("id,user_id,nome,telefone").eq("id", alunoId).maybeSingle();
    if (current.error || !current.data) throw new CommercialHttpError(404, "Aluno não encontrado.");
    const updated = await supabase.from("alunos").update({ nome, telefone }).eq("id", alunoId).select("id,user_id,nome,email,telefone").single();
    if (updated.error || !updated.data) throw new CommercialHttpError(500, "Não foi possível atualizar a ficha do aluno.");
    if (current.data.user_id) {
      const profile = await supabase.from("perfis_publicos").update({ nome_publico: nomePublico || null }).eq("id", current.data.user_id);
      if (profile.error) throw new CommercialHttpError(profile.error.code === "23505" ? 409 : 500, profile.error.code === "23505" ? "Este nome público já está em uso." : "Não foi possível atualizar o nome público.");
    }
    const audit = await supabase.from("auditoria_administrativa").insert({ ator_user_id: actor, acao: "atualizar_ficha", entidade: "aluno", entidade_id: alunoId, estado_anterior: current.data, estado_posterior: { ...updated.data, nome_publico: nomePublico } });
    assertQuery(audit);
    return { ...updated.data, nome_publico: nomePublico };
  }
  if (resource === "alunos" && action === "crm_atualizar") {
    const alunoId = uuid(body.id, "Aluno");
    const data = asObject(body.data);
    rejectUnknownKeys(data, ["tipo", "status", "observacao"]);
    const tipo = requiredString(data.tipo, "Tipo", 40);
    const status = optionalString(data.status, "Status", 50);
    if (!['whatsapp_aberto', 'whatsapp_enviado', 'uso_questoes', 'suporte_concluido'].includes(tipo)) throw new CommercialValidationError("Ação de pós-venda inválida.");
    if (tipo === "uso_questoes" && !["nao_confirmado", "conseguiu_utilizar", "precisa_ajuda", "problema_resolvido"].includes(status ?? "")) throw new CommercialValidationError("Status de uso das questões inválido.");
    const supabase = getSupabaseServerClient();
    const now = new Date().toISOString();
    const patch = tipo === "whatsapp_enviado" ? { whatsapp_enviado_em: now, updated_at: now } : tipo === "uso_questoes" ? { uso_questoes_status: status, uso_questoes_atualizado_em: now, updated_at: now } : tipo === "suporte_concluido" ? { suporte_inicial_concluido_em: now, updated_at: now } : { updated_at: now };
    const saved = await supabase.from("alunos_pos_venda").upsert({ aluno_id: alunoId, ...patch }, { onConflict: "aluno_id" });
    if (isMissingPostSaleSchema(saved)) throw new CommercialHttpError(503, "A migration do Mini-CRM ainda não foi aplicada. Aplique 20260812100000_create_student_post_sale_crm.sql para salvar ações de pós-venda.");
    assertQuery(saved);
    const event = await supabase.from("alunos_pos_venda_historico").insert({ aluno_id: alunoId, ator_user_id: actor, acao: tipo, status: status ?? null, observacao: optionalString(data.observacao, "Observação", 2000) ?? null });
    assertQuery(event);
    return { ok: true };
  }

  if (resource === "alunos" && action === "criar") {
    const data = validateStudentData(body.data);
    return rpc("admin_criar_aluno", { p_ator_user_id: actor, p_nome: data.nome, p_email: data.email });
  }
  if (resource === "alunos" && action === "gerar_senha_provisoria") {
    const alunoId = uuid(body.id, "Aluno");
    const supabase = getSupabaseServerClient();
    const current = await supabase.from("alunos").select("id,user_id,nome,email").eq("id", alunoId).single();
    if (current.error || !current.data) throw new CommercialHttpError(404, "Aluno não encontrado.");
    const email = String(current.data.email).trim().toLowerCase();
    const duplicates = await supabase.from("alunos").select("id,email").ilike("email", `%${email}%`);
    if (duplicates.error) throw new CommercialHttpError(500, "Não foi possível validar a identidade do aluno.");
    const sameIdentity = (duplicates.data ?? []).filter((item) => String(item.email).trim().toLowerCase() === email);
    if (sameIdentity.length !== 1) throw new CommercialHttpError(409, "Acesso bloqueado: existe duplicidade histórica para este e-mail.");
    const password = provisionalPassword();
    let userId = current.data.user_id as string | null;
    if (userId) {
      const updated = await supabase.auth.admin.updateUserById(userId, { password });
      if (updated.error) throw new CommercialHttpError(500, "Não foi possível atualizar a senha da conta Auth.");
    } else {
      let authUser = await findAuthUserByEmail(email);
      if (!authUser) {
        const created = await supabase.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { nome: current.data.nome ?? undefined } });
        if (created.error || !created.data.user) throw new CommercialHttpError(500, "Não foi possível criar a conta Auth.");
        authUser = created.data.user;
      } else {
        const updated = await supabase.auth.admin.updateUserById(authUser.id, { password });
        if (updated.error) throw new CommercialHttpError(500, "Não foi possível atualizar a senha da conta Auth existente.");
      }
      const conflict = await supabase.from("alunos").select("id").eq("user_id", authUser.id).neq("id", alunoId).maybeSingle();
      if (conflict.error) throw new CommercialHttpError(500, "Não foi possível validar o vínculo Auth.");
      if (conflict.data) throw new CommercialHttpError(409, "Acesso bloqueado: a conta Auth já pertence a outro aluno.");
      const linked = await supabase.from("alunos").update({ user_id: authUser.id }).eq("id", alunoId);
      if (linked.error) throw new CommercialHttpError(500, "Não foi possível vincular a conta Auth ao aluno.");
      userId = authUser.id;
    }
    const flagged = await supabase.from("alunos").update({ deve_trocar_senha: true }).eq("id", alunoId);
    if (flagged.error) throw new CommercialHttpError(500, "Não foi possível marcar a troca obrigatória de senha.");
    const audit = await supabase.from("auditoria_administrativa").insert({ ator_user_id: actor, acao: "gerar_senha_provisoria", entidade: "aluno", entidade_id: alunoId, detalhes: { user_id: userId } });
    if (audit.error) throw new CommercialHttpError(500, "Não foi possível auditar a senha provisória.");
    return { senha_provisoria: password, user_id: userId };
  }
  if (resource === "alunos" && action === "enviar_email_acesso") {
    const alunoId = uuid(body.id, "Aluno");
    try {
      return await sendManualStudentAccessEmail(getSupabaseServerClient(), alunoId, actor);
    } catch (error) {
      console.error("Falha no envio administrativo de e-mail de acesso", {
        aluno_id: alunoId,
        code: typeof error === "object" && error && "code" in error ? (error as { code?: unknown }).code : null,
        message: error instanceof Error ? error.message : "Falha desconhecida",
        details: typeof error === "object" && error && "details" in error ? (error as { details?: unknown }).details : null,
        hint: typeof error === "object" && error && "hint" in error ? (error as { hint?: unknown }).hint : null,
      });
      throw new CommercialHttpError(502, "Falha ao enviar e-mail. Consulte o log do servidor.");
    }
  }
  if (resource === "alunos" && action === "mesclar") {
    const data = asObject(body.data);
    return rpc("admin_mesclar_alunos", { p_ator_user_id: actor, p_principal: uuid(data.principal, "Principal"), p_secundario: uuid(data.secundario, "Secundario"), p_nome_final: optionalString(data.nome_final, "Nome final", 300) ?? null });
  }
  if (resource === "alunos" && action === "resumo_exclusao") {
    return rpc("admin_resumo_exclusao_aluno", { p_ator_user_id: actor, p_aluno_id: uuid(body.id, "Aluno") });
  }
  if (resource === "alunos" && action === "excluir_definitivamente") {
    const alunoId = uuid(body.id, "Aluno");
    const data = asObject(body.data);
    const confirmation = requiredString(data.confirmacao, "Confirmação", 20);
    if (confirmation !== "EXCLUIR") throw new CommercialHttpError(422, "Digite EXCLUIR para confirmar a exclusão definitiva.");
    const deleteAuth = booleanValue(data.excluir_auth, "Excluir conta Auth") ?? false;
    const supabase = getSupabaseServerClient();
    const current = await supabase.from("alunos").select("id,user_id").eq("id", alunoId).single();
    if (current.error || !current.data) throw new CommercialHttpError(404, "Aluno não encontrado.");
    if (current.data.user_id === actor) throw new CommercialHttpError(422, "Não é permitido excluir a própria conta administrativa.");
    if (current.data.user_id && !deleteAuth) {
      throw new CommercialHttpError(422, "O aluno possui conta Auth. Marque a exclusão da conta Auth para continuar.");
    }
    if (current.data.user_id) {
      const removed = await supabase.auth.admin.deleteUser(current.data.user_id);
      if (removed.error) throw new CommercialHttpError(502, "A conta Auth não pôde ser removida; nenhum dado do aluno foi alterado.");
    }
    return rpc("admin_excluir_aluno_definitivamente", {
      p_ator_user_id: actor,
      p_aluno_id: alunoId,
      p_confirmacao: confirmation,
      p_excluir_auth: deleteAuth,
    });
  }
  if (resource === "alunos" && action === "excluir") return rpc("admin_excluir_aluno_vazio", { p_ator_user_id: actor, p_aluno_id: uuid(body.id, "Aluno") });
  if (resource === "alunos" && action === "atualizar") {
    const alunoId = uuid(body.id, "Aluno");
    const data = validateStudentData(body.data);
    const supabase = getSupabaseServerClient();
    const current = await supabase.from("alunos").select("id,user_id,nome,email,telefone").eq("id", alunoId).single();
    if (current.data && "user_id" in current.data && current.data.user_id && String(current.data.email).trim().toLowerCase() !== data.email) throw new CommercialHttpError(409, "O e-mail de aluno com Auth nao pode ser alterado sem sincronizacao segura da conta Auth.");
    if (current.error || !current.data) throw new CommercialHttpError(404, "Aluno não encontrado.");
    const duplicate = await supabase.from("alunos").select("id").ilike("email", data.email).neq("id", alunoId).limit(1);
    if (duplicate.error) throw new CommercialHttpError(500, "Não foi possível validar os dados do aluno.");
    if (duplicate.data?.length) throw new CommercialHttpError(409, "Já existe outro aluno com este e-mail.");
    const updated = await supabase.from("alunos").update(data).eq("id", alunoId).select("id,user_id,nome,email,telefone").single();
    if (updated.error || !updated.data) {
      if (updated.error?.code === "23505") throw new CommercialHttpError(409, "Já existe outro aluno com este e-mail.");
      throw new CommercialHttpError(500, "Não foi possível atualizar os dados do aluno.");
    }
    const audit = await supabase.from("auditoria_administrativa").insert({
      ator_user_id: actor, acao: "atualizar", entidade: "aluno", entidade_id: alunoId,
      estado_anterior: current.data, estado_posterior: updated.data,
    });
    if (audit.error) throw new CommercialHttpError(500, "Não foi possível registrar a atualização do aluno.");
    return updated.data;
  }

  if (resource === "anki_tutoriais" && action === "atualizar") {
    return rpc("admin_atualizar_configuracao_anki_tutoriais", {
      p_ator_user_id: actor,
      p_dados: validateAnkiTutorialSettings(body.data),
    });
  }

  if (resource === "leis") {
    if (action === "criar") {
      const data = validateLawData(body.data);
      return rpc("admin_criar_lei", { p_ator_user_id: actor, ...Object.fromEntries(Object.entries(data).map(([key, value]) => [`p_${key}`, value])) });
    }
    if (action === "atualizar") return rpc("admin_atualizar_lei", { p_ator_user_id: actor, p_lei_id: positiveIntegerId(body.id, "Lei"), p_dados: validateLawData(body.data, true) });
  }

  if (resource === "materiais") {
    if (action === "criar") {
      const data = validateMaterialData(body.data);
      return rpc("admin_criar_material_lei", { p_ator_user_id: actor, ...Object.fromEntries(Object.entries(data).map(([key, value]) => [`p_${key}`, value])) });
    }
    if (action === "atualizar") return rpc("admin_atualizar_material_lei", { p_ator_user_id: actor, p_material_id: positiveIntegerId(body.id, "Material"), p_dados: validateMaterialData(body.data, true) });
  }

  if (resource === "atualizacoes") {
    if (action === "criar") {
      const data = validateEditorialUpdateData(body.data);
      return rpc("admin_criar_atualizacao_lei", { p_ator_user_id: actor, ...Object.fromEntries(Object.entries(data).map(([key, value]) => [`p_${key}`, value])) });
    }
    if (action === "atualizar") return rpc("admin_atualizar_atualizacao_lei", { p_ator_user_id: actor, p_atualizacao_id: positiveIntegerId(body.id, "Atualização"), p_dados: validateEditorialUpdateData(body.data, true) });
    if (action === "ocultar") return rpc("admin_ocultar_atualizacao_lei", { p_ator_user_id: actor, p_atualizacao_id: positiveIntegerId(body.id, "Atualização") });
    if (action === "publicar_versao") {
      const data = asObject(body.data);
      const allowed = [
        "material_lei_id", "nova_url_externa", "nova_versao", "nova_quantidade_itens", "revisado_em", "publicado_em",
        "tipo_atualizacao", "importancia", "titulo", "descricao_resumida", "referencia_normativa", "data_referencia_normativa",
        "quantidade_questoes_adicionadas", "quantidade_questoes_corrigidas", "quantidade_flashcards_revisados",
        "visivel_aluno", "visivel_catalogo", "observacao_interna",
      ] as const;
      rejectUnknownKeys(data, allowed);
      const revisadoEm = optionalIsoDate(data.revisado_em, "Data de revisão");
      const publicadoEm = optionalIsoDate(data.publicado_em, "Data de publicação");
      if (!revisadoEm || !publicadoEm) throw new CommercialValidationError("As datas de revisão e publicação são obrigatórias.");
      return rpc("admin_publicar_nova_versao_material", {
        p_ator_user_id: actor,
        p_material_lei_id: positiveIntegerId(data.material_lei_id, "Material"),
        p_nova_url_externa: requiredString(data.nova_url_externa, "Nova URL", 4000),
        p_nova_versao: requiredString(data.nova_versao, "Nova versão", 100),
        p_nova_quantidade_itens: nonNegativeInteger(data.nova_quantidade_itens, "Nova quantidade"),
        p_revisado_em: revisadoEm,
        p_publicado_em: publicadoEm,
        p_tipo_atualizacao: enumValue(data.tipo_atualizacao, EDITORIAL_UPDATE_TYPES, "Tipo"),
        p_importancia: enumValue(data.importancia, EDITORIAL_IMPORTANCE, "Importância"),
        p_titulo: requiredString(data.titulo, "Título", 300),
        p_descricao_resumida: optionalString(data.descricao_resumida, "Descrição resumida", 4000) ?? null,
        p_referencia_normativa: optionalString(data.referencia_normativa, "Referência normativa", 500) ?? null,
        p_data_referencia_normativa: optionalIsoDate(data.data_referencia_normativa, "Data da referência normativa") ?? null,
        p_quantidade_questoes_adicionadas: optionalNonNegativeInteger(data.quantidade_questoes_adicionadas, "Questões adicionadas") ?? null,
        p_quantidade_questoes_corrigidas: optionalNonNegativeInteger(data.quantidade_questoes_corrigidas, "Questões corrigidas") ?? null,
        p_quantidade_flashcards_revisados: optionalNonNegativeInteger(data.quantidade_flashcards_revisados, "Flashcards revisados") ?? null,
        p_visivel_aluno: booleanValue(data.visivel_aluno ?? true, "Visível ao aluno"),
        p_visivel_catalogo: booleanValue(data.visivel_catalogo ?? false, "Visível no catálogo"),
        p_observacao_interna: optionalString(data.observacao_interna, "Observação interna", 4000) ?? null,
      });
    }
  }

  if (resource === "produtos") {
    if (action === "criar") {
      const data = validateProductData(body.data);
      return rpc("admin_criar_produto", { p_ator_user_id: actor, ...Object.fromEntries(Object.entries(data).map(([key, value]) => [`p_${key}`, value])) });
    }
    if (action === "atualizar") return rpc("admin_atualizar_produto", { p_ator_user_id: actor, p_produto_id: uuid(body.id, "Produto"), p_dados: validateProductData(body.data, true) });
    if (action === "definir_leis") return rpc("admin_definir_leis_produto", { p_ator_user_id: actor, p_produto_id: uuid(body.id, "Produto"), p_lei_ids: idList(body.lei_ids, "Lista de leis") });
  }

  if (resource === "aquisicoes") {
    if (action === "importar_hotmart_historico") {
      const data = asObject(body.data);
      rejectUnknownKeys(data, ["vendas", "dry_run"]);
      return importHistoricalHotmartSales(actor, data.vendas, data.dry_run === true);
    }
    const purchaseId = action === "registrar" ? null : uuid(body.id, "Aquisição");
    if (action === "registrar") {
      const data = asObject(body.data);
      rejectUnknownKeys(data, ["aluno_id", "produto_id", "origem", "identificador_externo", "observacao_administrativa"]);
      const registered = await rpc("admin_registrar_aquisicao", {
        p_ator_user_id: actor,
        p_aluno_id: uuid(data.aluno_id, "Aluno"),
        p_produto_id: uuid(data.produto_id, "Produto"),
        p_origem: enumValue(data.origem, COMMERCIAL_ORIGINS, "Origem"),
        p_identificador_externo: optionalString(data.identificador_externo, "Identificador externo", 500) ?? null,
        p_observacao_administrativa: optionalString(data.observacao_administrativa, "Observação", 4000) ?? null,
      });
      try {
        const supabase = getSupabaseServerClient();
        const [product, student] = await Promise.all([
          supabase.from("produtos").select("nome").eq("id", uuid(data.produto_id, "Produto")).maybeSingle(),
          supabase.from("alunos").select("nome,email").eq("id", uuid(data.aluno_id, "Aluno")).maybeSingle(),
        ]);
        const purchaseId = String((registered as { compra?: { id?: string } } | null)?.compra?.id ?? "");
        if (purchaseId) await createOperationalAdminNotification(supabase, {
          tipo: "nova_aquisicao", titulo: "Nova aquisição",
          mensagem: `${student.data?.nome || student.data?.email || "Aluno"} adquiriu ${product.data?.nome || "um produto"}. Origem: ${enumValue(data.origem, COMMERCIAL_ORIGINS, "Origem")}.`,
          link: `/admin/comercial?tab=aquisicoes&q=${encodeURIComponent(purchaseId)}`,
          entidadeTipo: "aquisicao", entidadeId: purchaseId,
        });
        await notifyStudentAccess(supabase, {
          studentId: uuid(data.aluno_id, "Aluno"), origin: enumValue(data.origem, COMMERCIAL_ORIGINS, "Origem") as FirstAccessOrigin,
          idempotencyKey: `administrativo:${String((registered as { compra?: { id?: string } } | null)?.compra?.id ?? data.aluno_id)}`,
          accessLabel: product.data?.nome ?? "um novo produto",
          notificationOrigin: "aquisicao_manual",
        });
      } catch { /* A aquisição já foi registrada; a falha de primeiro acesso é auditada sem credenciais. */ }
      return registered;
    }
    if (action === "cancelar") return rpc("admin_cancelar_aquisicao", { p_ator_user_id: actor, p_compra_id: purchaseId });
    if (action === "reembolsar") return rpc("admin_reembolsar_aquisicao", { p_ator_user_id: actor, p_compra_id: purchaseId });
    if (action === "reativar") return rpc("admin_reativar_aquisicao", { p_ator_user_id: actor, p_compra_id: purchaseId });
  }

  if (resource === "liberacoes") {
    if (action === "conceder") {
      const data = asObject(body.data);
      rejectUnknownKeys(data, ["aluno_id", "lei_id", "origem", "motivo"]);
      const granted = await rpc("admin_conceder_lei_manual", {
        p_ator_user_id: actor,
        p_aluno_id: uuid(data.aluno_id, "Aluno"),
        p_lei_id: positiveIntegerId(data.lei_id, "Lei"),
        p_origem: enumValue(data.origem, MANUAL_ORIGINS, "Origem"),
        p_motivo: optionalString(data.motivo, "Motivo", 2000) ?? null,
      });
      try {
        const supabase = getSupabaseServerClient();
        const [law, student] = await Promise.all([
          supabase.from("leis").select("titulo").eq("id", positiveIntegerId(data.lei_id, "Lei")).maybeSingle(),
          supabase.from("alunos").select("nome,email").eq("id", uuid(data.aluno_id, "Aluno")).maybeSingle(),
        ]);
        const releaseId = String((granted as { id?: string | number } | null)?.id ?? "");
        if (releaseId) await createOperationalAdminNotification(supabase, {
          tipo: "nova_liberacao", titulo: "Novo acesso liberado",
          mensagem: `${law.data?.titulo || "Uma legislação"} foi liberada para ${student.data?.nome || student.data?.email || "o aluno"}.`,
          link: `/admin/comercial?tab=alunos&q=${encodeURIComponent(uuid(data.aluno_id, "Aluno"))}`,
          entidadeTipo: "liberacao", entidadeId: releaseId,
        });
        await notifyStudentAccess(supabase, {
          studentId: uuid(data.aluno_id, "Aluno"), origin: enumValue(data.origem, MANUAL_ORIGINS, "Origem") as FirstAccessOrigin,
          idempotencyKey: `liberacao:${String((granted as { id?: string | number } | null)?.id ?? `${data.aluno_id}:${data.lei_id}`)}`,
          accessLabel: law.data?.titulo ?? "uma nova legislação",
          kind: "release",
          notificationOrigin: "liberacao_manual",
        });
      } catch { /* A liberação permanece válida; a falha de e-mail fica auditada. */ }
      return granted;
    }
    if (action === "revogar") {
      const data = asObject(body.data ?? {});
      rejectUnknownKeys(data, ["motivo"]);
      return rpc("admin_revogar_liberacao", {
        p_ator_user_id: actor,
        p_liberacao_id: positiveIntegerId(body.id, "Liberação"),
        p_motivo: optionalString(data.motivo, "Motivo", 2000) ?? null,
      });
    }
  }

  throw new CommercialValidationError("Ação não permitida para este recurso.");
}
