import "server-only";
import { obterAdministrador } from "@/lib/admin-auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { postSaleCompletionForPurchase } from "@/lib/student-center-postsale";
import { matchesStudentCenterFilters } from "@/lib/student-center-filters";

const db = () => getSupabaseServerClient();
const clean = (value: unknown) => typeof value === "string" ? value.trim() : "";
async function admin() { const user = await obterAdministrador(); if (!user) throw new Error("Administração obrigatória."); return user; }

export async function studentCenterList(url: URL) {
  await admin();
  const q = clean(url.searchParams.get("q")); const quick = clean(url.searchParams.get("quick")); const origin = clean(url.searchParams.get("origin")); const lawId = clean(url.searchParams.get("law")); const productId = clean(url.searchParams.get("product")); const access = clean(url.searchParams.get("access")); const commercial = clean(url.searchParams.get("commercial")); const purchasePeriod = clean(url.searchParams.get("purchase_period")); const purchaseStart = clean(url.searchParams.get("purchase_start")); const purchaseEnd = clean(url.searchParams.get("purchase_end")); const study = clean(url.searchParams.get("study")); const postSaleFilter = clean(url.searchParams.get("post_sale"));
  const supabase = db();
  let query = supabase.from("alunos").select("id,nome,email,telefone,criado_em,primeiro_acesso_em,ultimo_acesso_em,total_logins").order("criado_em", { ascending: false }).limit(200);
  if (q) query = query.or(`nome.ilike.%${q.replace(/[,%()]/g, " ")}%,email.ilike.%${q.replace(/[,%()]/g, " ")}%,telefone.ilike.%${q.replace(/[,%()]/g, " ")}%`);
  const students = (await query).data ?? []; const ids = students.map((s) => s.id);
  const [purchasesResult, releasesResult, activityResult, postSaleResult] = await Promise.all([
    ids.length ? supabase.from("compras").select("id,aluno_id,produto_id,origem,status_acesso,adquirida_em,produtos(nome)").in("aluno_id", ids) : Promise.resolve({ data: [] }),
    ids.length ? supabase.from("liberacoes_leis").select("aluno_id,lei_id,status,concedida_em,leis(titulo)").in("aluno_id", ids).eq("status", "ativo") : Promise.resolve({ data: [] }),
    ids.length ? supabase.from("campanhas_leis_alunos").select("aluno_id,updated_at,concluida,total_erros").in("aluno_id", ids).eq("score_version", 2) : Promise.resolve({ data: [] }),
    ids.length ? supabase.from("compras_pos_venda").select("compra_id,etapa_6_concluida_em") : Promise.resolve({ data: [] }),
  ]);
  const purchases = purchasesResult.data ?? []; const releases = releasesResult.data ?? []; const activities = activityResult.data ?? []; const postSale = new Map((postSaleResult.data ?? []).map((x) => [x.compra_id, x]));
  const now = Date.now(); const recent = now - 14 * 86400000;
  const items = students.map((student) => {
    const ownPurchases = purchases.filter((row) => row.aluno_id === student.id); const ownReleases = releases.filter((row) => row.aluno_id === student.id);
    const ownActivity = activities.filter((row) => row.aluno_id === student.id).sort((a,b) => String(b.updated_at).localeCompare(String(a.updated_at)))[0];
    const activePurchases = ownPurchases.filter((row) => row.status_acesso === "ativo");
    const latest = activePurchases.sort((a,b) => String(b.adquirida_em).localeCompare(String(a.adquirida_em)))[0];
    const postSalePending = Boolean(latest && latest.adquirida_em && Date.parse(latest.adquirida_em) >= recent && !postSale.get(latest.id)?.etapa_6_concluida_em);
    return { ...student, products: activePurchases.length, lawIds: ownReleases.map((x:any) => String(x.lei_id)), laws: ownReleases.map((x:any) => x.leis?.titulo).filter(Boolean), productIds: activePurchases.flatMap((x:any) => [String(x.produto_id), x.produtos?.nome].filter(Boolean)), purchaseDates: activePurchases.map((x:any) => x.adquirida_em).filter(Boolean), origin: latest?.origem ?? null, lastPurchase: latest?.adquirida_em ?? null, productName: (latest as any)?.produtos?.nome ?? null, lastStudy: ownActivity?.updated_at ?? null, errors: ownActivity?.total_erros ?? 0, postSalePending, postSaleStatus: latest ? (postSale.get(latest.id)?.etapa_6_concluida_em ? "done" : "pending") : "none", postSalePurchaseId: postSalePending ? latest?.id ?? null : null };
  }).filter((row) => matchesStudentCenterFilters({ ...row, laws: [...row.lawIds, ...row.laws] }, { quick, origin, lawId, productId, access, commercial, purchasePeriod, purchaseStart, purchaseEnd, study, postSale: postSaleFilter }, now));
  if (quick === "post_sale") items.sort((a, b) => String(b.lastPurchase).localeCompare(String(a.lastPurchase)));
  const [laws, products] = await Promise.all([supabase.from("leis").select("id,titulo").eq("ativo", true).order("titulo"), supabase.from("produtos").select("id,nome").eq("ativo", true).order("nome")]);
  const actor = await admin();
  const [notices, savedFilters] = await Promise.all([
    supabase.from("law_update_notices").select("id,title,message,law_id,created_at,leis(titulo)").eq("status", "draft").order("created_at", { ascending: false }),
    supabase.from("filtros_alunos_salvos").select("id,nome,filtros,created_at").eq("ator_user_id", actor.id).order("created_at", { ascending: false }),
  ]);
  return { items, laws: laws.data ?? [], products: products.data ?? [], notices: notices.data ?? [], savedFilters: savedFilters.data ?? [] };
}

export async function studentCenterDetail(id: string) {
  await admin(); const supabase = db();
  const student = await supabase.from("alunos").select("*").eq("id", id).maybeSingle(); if (!student.data) throw new Error("Aluno não encontrado.");
  const [purchases, releases, progress, campaigns, comments, audit, manual, profile] = await Promise.all([
    supabase.from("compras").select("id,origem,status_acesso,adquirida_em,produtos(nome)").eq("aluno_id", id).order("adquirida_em", { ascending: false }),
    supabase.from("liberacoes_leis").select("id,origem,status,concedida_em,leis(titulo),produtos(nome)").eq("aluno_id", id).order("concedida_em", { ascending: false }),
    supabase.from("progresso_leis_alunos").select("id,lei_id,em_estudo,questoes_finalizadas,updated_at,leis(titulo)").eq("aluno_id", id).order("updated_at", { ascending: false }),
    supabase.from("campanhas_leis_alunos").select("id,lei_id,iniciada_em,updated_at,concluida,concluida_em,total_erros,score,score_ajustado,leis(titulo)").eq("aluno_id", id).eq("score_version", 2).order("updated_at", { ascending: false }),
    student.data.user_id ? supabase.from("legisbot_comentarios_comunidade").select("id,slug,ordem,conteudo,status,curtidas_count,created_at").eq("user_id", student.data.user_id).order("created_at", { ascending: false }).limit(20) : Promise.resolve({ data: [] }),
    supabase.from("auditoria_administrativa").select("acao,entidade,detalhes,created_at").eq("entidade_id", id).order("created_at", { ascending: false }).limit(50),
    supabase.from("acoes_alunos_historico").select("tipo,descricao,detalhes,created_at").eq("aluno_id", id).order("created_at", { ascending: false }).limit(50),
    student.data.user_id ? supabase.from("perfis_publicos").select("nome_publico").eq("id", student.data.user_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const purchaseRows = purchases.data ?? [];
  const postSale = purchaseRows.length ? await supabase.from("compras_pos_venda").select("compra_id,etapa_6_concluida_em").in("compra_id", purchaseRows.map((purchase:any) => purchase.id)) : { data: [] };
  const latestActivePurchase = purchaseRows.filter((purchase:any) => purchase.status_acesso === "ativo").sort((a:any,b:any) => String(b.adquirida_em).localeCompare(String(a.adquirida_em)))[0];
  const completion = (postSale.data ?? []).find((row:any) => row.compra_id === latestActivePurchase?.id);
  return { student: { ...student.data, nome_publico: profile.data?.nome_publico ?? null }, purchases: purchaseRows, releases: releases.data ?? [], progress: progress.data ?? [], campaigns: campaigns.data ?? [], comments: comments.data ?? [], xp: null, postSale: latestActivePurchase ? { compraId: latestActivePurchase.id, status: completion?.etapa_6_concluida_em ? "feito" : "pendente" } : null, history: [...(audit.data ?? []), ...(manual.data ?? [])].sort((a,b) => String(b.created_at).localeCompare(String(a.created_at))) };
}

export async function studentCenterAction(body: Record<string, unknown>) {
  const actor = await admin(); const action = clean(body.action); const supabase = db();
  if (action === "save_filter") {
    const nome = clean(body.nome);
    const filtros = body.filtros;
    if (!nome || nome.length > 80 || !filtros || typeof filtros !== "object" || Array.isArray(filtros)) throw new Error("Informe um nome e filtros válidos.");
    const result = await supabase.from("filtros_alunos_salvos").upsert({ ator_user_id: actor.id, nome, filtros }, { onConflict: "ator_user_id,nome" }).select("id,nome,filtros,created_at").single();
    if (result.error) throw new Error(result.error.message);
    return result.data;
  }
  if (action === "delete_saved_filter") {
    const id = Number(body.id);
    if (!Number.isSafeInteger(id) || id < 1) throw new Error("Filtro inválido.");
    const result = await supabase.from("filtros_alunos_salvos").delete().eq("id", id).eq("ator_user_id", actor.id);
    if (result.error) throw new Error(result.error.message);
    return { ok: true };
  }
  if (action === "mark_post_sale") {
    const alunoId = clean(body.aluno_id); const compraId = clean(body.compra_id);
    if (!/^[0-9a-f-]{36}$/i.test(alunoId) || !/^[0-9a-f-]{36}$/i.test(compraId)) throw new Error("Aluno ou compra inválidos.");
    const purchase = await supabase.from("compras").select("id,aluno_id,status_acesso").eq("id", compraId).maybeSingle();
    if (purchase.error) throw new Error("Não foi possível validar a compra.");
    const now = new Date().toISOString(); const completion = postSaleCompletionForPurchase(purchase.data, alunoId, compraId, now);
    const updated = await supabase.from("compras_pos_venda").upsert(completion, { onConflict: "compra_id" });
    if (updated.error) throw new Error("Não foi possível concluir o pós-venda desta compra.");
    const purchaseHistory = await supabase.from("compras_pos_venda_historico").insert({ compra_id: compraId, ator_user_id: actor.id, etapa: 6, acao: "etapa_6_concluida_pela_central", observacao: "Pós-venda marcado como realizado pela Central do Aluno." });
    if (purchaseHistory.error) throw new Error("Não foi possível registrar o histórico do pós-venda.");
    const centralHistory = await supabase.from("acoes_alunos_historico").insert({ aluno_id: alunoId, ator_user_id: actor.id, tipo: "pos_venda_realizado", descricao: "Pós-venda marcado como realizado.", detalhes: { compra_id: compraId } });
    if (centralHistory.error) throw new Error("Não foi possível registrar o histórico da Central.");
    return { ok: true };
  }
  if (action === "register_manual_message") { const alunoId=clean(body.aluno_id),message=clean(body.message); if(!/^[0-9a-f-]{36}$/i.test(alunoId)||!message)throw new Error("Aluno ou mensagem inválidos."); const result=await supabase.from("acoes_alunos_historico").insert({aluno_id:alunoId,ator_user_id:actor.id,tipo:"mensagem_manual",descricao:"Modelo usado em contato manual.",detalhes:{message,channel:clean(body.channel)||"manual"}});if(result.error)throw new Error(result.error.message);return {ok:true}; }
  const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x)) : [];
  if (!ids.length) throw new Error("Selecione ao menos um aluno.");
  if (action === "register_message") { const message = clean(body.message); if (!message) throw new Error("Informe a mensagem utilizada."); await supabase.from("acoes_alunos_historico").insert(ids.map((aluno_id) => ({ aluno_id, ator_user_id: actor.id, tipo: "mensagem_manual", descricao: "Mensagem manual utilizada.", detalhes: { message } }))); return { ok: true }; }
  throw new Error("Ação não permitida.");
}

export async function savedStudentMessages() { await admin(); const result = await db().from("mensagens_alunos_salvas").select("*").order("nome"); return result.data ?? []; }
export async function mutateSavedStudentMessage(method: string, id: string | null, body: Record<string, unknown>) {
  await admin(); const supabase = db();
  if (method === "POST") { const nome = clean(body.nome); const texto = clean(body.texto); if (!nome || !texto) throw new Error("Informe nome e texto da mensagem."); const result = await supabase.from("mensagens_alunos_salvas").insert({ nome, texto, ativo: body.ativo !== false }).select().single(); if (result.error) throw new Error(result.error.message); return result.data; }
  const messageId = Number(id); if (!Number.isSafeInteger(messageId) || messageId < 1) throw new Error("Mensagem inválida.");
  if (method === "DELETE") { const result = await supabase.from("mensagens_alunos_salvas").delete().eq("id", messageId); if (result.error) throw new Error(result.error.message); return { ok: true }; }
  const patch: Record<string, unknown> = {}; if ("nome" in body) patch.nome = clean(body.nome); if ("texto" in body) patch.texto = clean(body.texto); if ("ativo" in body && typeof body.ativo === "boolean") patch.ativo = body.ativo;
  if (!Object.keys(patch).length || Object.values(patch).some((v) => v === "")) throw new Error("Informe os dados válidos da mensagem."); const result = await supabase.from("mensagens_alunos_salvas").update(patch).eq("id", messageId).select().single(); if (result.error) throw new Error(result.error.message); return result.data;
}
