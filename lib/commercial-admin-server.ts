import "server-only";

import type { User } from "@supabase/supabase-js";
import { obterAdministrador } from "@/lib/admin-auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import {
  COMMERCIAL_ORIGINS,
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
  optionalString,
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

async function rpc(name: string, params: JsonObject) {
  const result = await getSupabaseServerClient().rpc(name, params);
  if (result.error) {
    const code = String(result.error.code ?? "");
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

export async function getCommercialResource(resource: CommercialResource, request: Request) {
  await requireAdmin();
  const supabase = getSupabaseServerClient();
  const url = new URL(request.url);
  const q = safeSearch(url.searchParams.get("q"));
  const { page, limit, from, to } = paging(url);

  if (resource === "alunos") {
    if (q.length < 3) return pageResult([], 0, 1, Math.min(limit, 10));
    const studentLimit = Math.min(limit, 10);
    let query = supabase.from("alunos").select("id,user_id,nome,email", { count: "exact" });
    if (/^[0-9a-f-]{36}$/i.test(q)) query = query.or(`id.eq.${q},user_id.eq.${q},email.ilike.%${q}%,nome.ilike.%${q}%`);
    else query = query.or(`email.ilike.%${q}%,nome.ilike.%${q}%`);
    const students = await query.order("nome", { ascending: true }).limit(studentLimit);
    assertQuery(students);
    const userIds = (students.data ?? []).map((row) => String(row.user_id)).filter(Boolean);
    const profiles = userIds.length
      ? await supabase.from("perfis_publicos").select("id,nome_publico").in("id", userIds)
      : { data: [], error: null };
    assertQuery(profiles);
    const publicNames = new Map((profiles.data ?? []).map((row) => [String(row.id), String(row.nome_publico)]));
    const items = (students.data ?? []).map((row) => ({
      id: row.id,
      user_id: row.user_id,
      nome: row.nome,
      email: row.email,
      nome_publico: publicNames.get(String(row.user_id)) ?? null,
    }));
    return pageResult(items, Math.min(students.count ?? items.length, studentLimit), 1, studentLimit);
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

  if (resource === "produtos") {
    let query = supabase.from("produtos").select("*", { count: "exact" });
    if (q) query = query.or(`nome.ilike.%${q}%,slug.ilike.%${q}%,hotmart_product_id.ilike.%${q}%`);
    const result = await query.order("ordem").order("nome").range(from, to);
    assertQuery(result);
    const ids = (result.data ?? []).map((row) => String(row.id));
    const links = ids.length
      ? await supabase.from("produto_leis").select("produto_id,lei_id,ordem,leis(id,slug,titulo)").in("produto_id", ids).order("ordem")
      : { data: [], error: null };
    assertQuery(links);
    const byProduct = new Map<string, unknown[]>();
    for (const link of links.data ?? []) {
      const key = String(link.produto_id);
      byProduct.set(key, [...(byProduct.get(key) ?? []), link]);
    }
    return pageResult((result.data ?? []).map((row) => ({ ...row, leis: byProduct.get(String(row.id)) ?? [] })), result.count, page, limit);
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
    const status = safeSearch(url.searchParams.get("status"), 30);
    if (alunoId) query = query.eq("aluno_id", uuid(alunoId, "Aluno"));
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
  const allowed = ["slug", "titulo", "nome_curto", "descricao", "codigo", "categoria", "ativo", "ordem", "thumbnail_url"] as const;
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
  return result;
}

function validateMaterialData(raw: unknown, update = false) {
  const allowed = ["lei_id", "tipo", "titulo", "descricao", "provedor", "url_externa", "acao", "ordem", "ativo"] as const;
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
  return result;
}

function validateProductData(raw: unknown, update = false) {
  const allowed = ["nome", "slug", "descricao", "tipo_produto", "hotmart_url", "hotmart_product_id", "ordem", "ativo", "observacao_administrativa"] as const;
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
  if (!update || "ordem" in data) result.ordem = nonNegativeInteger(data.ordem, "Ordem", 0);
  if (!update || "ativo" in data) result.ativo = booleanValue(data.ativo ?? true, "Ativo");
  if (!update || "observacao_administrativa" in data) {
    const value = optionalString(data.observacao_administrativa, "Observação", 4000);
    result.observacao_administrativa = update ? value : value ?? null;
  }
  return result;
}

export async function mutateCommercialResource(resource: CommercialResource, request: Request) {
  const admin = await requireAdmin();
  const actor = uuid(admin.id, "Administrador");
  const body = await readCommercialBody(request);
  const action = requiredString(body.action, "Ação", 40);
  rejectUnknownKeys(body, ["action", "id", "data", "lei_ids"]);

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

  if (resource === "produtos") {
    if (action === "criar") {
      const data = validateProductData(body.data);
      return rpc("admin_criar_produto", { p_ator_user_id: actor, ...Object.fromEntries(Object.entries(data).map(([key, value]) => [`p_${key}`, value])) });
    }
    if (action === "atualizar") return rpc("admin_atualizar_produto", { p_ator_user_id: actor, p_produto_id: uuid(body.id, "Produto"), p_dados: validateProductData(body.data, true) });
    if (action === "definir_leis") return rpc("admin_definir_leis_produto", { p_ator_user_id: actor, p_produto_id: uuid(body.id, "Produto"), p_lei_ids: idList(body.lei_ids, "Lista de leis") });
  }

  if (resource === "aquisicoes") {
    const purchaseId = action === "registrar" ? null : uuid(body.id, "Aquisição");
    if (action === "registrar") {
      const data = asObject(body.data);
      rejectUnknownKeys(data, ["aluno_id", "produto_id", "origem", "identificador_externo", "observacao_administrativa"]);
      return rpc("admin_registrar_aquisicao", {
        p_ator_user_id: actor,
        p_aluno_id: uuid(data.aluno_id, "Aluno"),
        p_produto_id: uuid(data.produto_id, "Produto"),
        p_origem: enumValue(data.origem, COMMERCIAL_ORIGINS, "Origem"),
        p_identificador_externo: optionalString(data.identificador_externo, "Identificador externo", 500) ?? null,
        p_observacao_administrativa: optionalString(data.observacao_administrativa, "Observação", 4000) ?? null,
      });
    }
    if (action === "cancelar") return rpc("admin_cancelar_aquisicao", { p_ator_user_id: actor, p_compra_id: purchaseId });
    if (action === "reembolsar") return rpc("admin_reembolsar_aquisicao", { p_ator_user_id: actor, p_compra_id: purchaseId });
    if (action === "reativar") return rpc("admin_reativar_aquisicao", { p_ator_user_id: actor, p_compra_id: purchaseId });
  }

  if (resource === "liberacoes") {
    if (action === "conceder") {
      const data = asObject(body.data);
      rejectUnknownKeys(data, ["aluno_id", "lei_id", "origem", "motivo"]);
      return rpc("admin_conceder_lei_manual", {
        p_ator_user_id: actor,
        p_aluno_id: uuid(data.aluno_id, "Aluno"),
        p_lei_id: positiveIntegerId(data.lei_id, "Lei"),
        p_origem: enumValue(data.origem, MANUAL_ORIGINS, "Origem"),
        p_motivo: optionalString(data.motivo, "Motivo", 2000) ?? null,
      });
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
