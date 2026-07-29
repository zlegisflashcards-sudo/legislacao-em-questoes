import Link from "next/link";
import { moderateCommunityComment } from "@/app/admin/community-actions";
import { sairAdministrador } from "@/app/admin/actions";
import { exigirAdministrador } from "@/lib/admin-auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 30;
type Query = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] ?? "" : value ?? "";
const fmt = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));

function pageHref(query: Query, page: number) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (one(value)) params.set(key, one(value));
  params.set("page", String(page));
  return `?${params}`;
}

export default async function AdminCommunityPage({ searchParams }: { searchParams: Promise<Query> }) {
  const [query, admin] = await Promise.all([searchParams, exigirAdministrador()]);
  const supabase = getSupabaseServerClient();
  const q = one(query.q).trim().replace(/[,%()]/g, " ");
  const userSearch = one(query.usuario).trim().replace(/[,%()]/g, " ");
  const status = one(query.status);
  const reported = one(query.denunciados) === "1";
  const page = Math.max(1, Number(one(query.page)) || 1);
  const start = (page - 1) * PAGE_SIZE;

  let userIds: string[] | null = null;
  if (userSearch) {
    const profiles = await supabase.from("perfis_publicos").select("id").ilike("nome_publico", `%${userSearch}%`).limit(200);
    if (profiles.error) throw new Error("Não foi possível pesquisar os perfis.");
    userIds = (profiles.data ?? []).map((row) => String(row.id));
  }
  let reportedIds: string[] | null = null;
  if (reported) {
    const reports = await supabase.from("legisbot_comentarios_denuncias").select("comentario_id").in("status", ["pendente", "em_analise"]).limit(1000);
    if (reports.error) throw new Error("Não foi possível consultar as denúncias.");
    reportedIds = [...new Set((reports.data ?? []).map((row) => String(row.comentario_id)))];
  }

  let request = supabase.from("legisbot_comentarios_comunidade").select("*", { count: "exact" });
  if (q) request = request.or(`slug.ilike.%${q}%,ordem.ilike.%${q}%,conteudo.ilike.%${q}%`);
  if (status) request = request.eq("status", status);
  if (userIds) request = userIds.length ? request.in("user_id", userIds) : request.eq("user_id", "00000000-0000-0000-0000-000000000000");
  if (reportedIds) request = reportedIds.length ? request.in("id", reportedIds) : request.eq("id", "00000000-0000-0000-0000-000000000000");
  const result = await request.order("created_at", { ascending: false }).range(start, start + PAGE_SIZE - 1);
  if (result.error) throw new Error("Não foi possível carregar os comentários da comunidade.");
  const records = result.data ?? [];

  const ids = records.map((row) => String(row.id));
  const authors = [...new Set(records.map((row) => String(row.user_id)))];
  const [profilesResult, reportsResult] = await Promise.all([
    authors.length ? supabase.from("perfis_publicos").select("id,nome_publico").in("id", authors) : Promise.resolve({ data: [], error: null }),
    ids.length ? supabase.from("legisbot_comentarios_denuncias").select("comentario_id,status,motivo").in("comentario_id", ids) : Promise.resolve({ data: [], error: null }),
  ]);
  const names = new Map((profilesResult.data ?? []).map((row) => [String(row.id), String(row.nome_publico)]));
  const reports = new Map<string, Array<{ status: string; motivo: string }>>();
  for (const report of reportsResult.data ?? []) {
    const key = String(report.comentario_id);
    reports.set(key, [...(reports.get(key) ?? []), { status: String(report.status), motivo: String(report.motivo) }]);
  }
  const pages = Math.max(1, Math.ceil((result.count ?? 0) / PAGE_SIZE));

  return <main className="admin-shell">
    <Link className="admin-central-link" href="/admin">← Central Administrativa</Link>
    <header className="admin-header"><div><div className="admin-eyebrow">Administração</div><h1>Comentários da comunidade</h1><p>{result.count ?? 0} registro(s) encontrado(s)</p></div><div className="admin-header-actions"><Link className="admin-button secondary" href="/admin/legisbot">Comentários do LegisBot</Link><span>{admin.email}</span><form action={sairAdministrador}><button className="admin-button secondary">Sair</button></form></div></header>
    <form className="admin-filters">
      <label className="admin-search">Buscar conteúdo<input name="q" defaultValue={q} placeholder="Slug, ordem ou conteúdo" /></label>
      <label>Usuário<input name="usuario" defaultValue={userSearch} placeholder="Nome público" /></label>
      <label>Status<select name="status" defaultValue={status}><option value="">Todos</option><option value="publicado">Publicado</option><option value="em_analise">Em análise</option><option value="oculto">Oculto</option><option value="removido">Removido</option></select></label>
      <label>Denúncias<select name="denunciados" defaultValue={reported ? "1" : ""}><option value="">Todos</option><option value="1">Com denúncia pendente</option></select></label>
      <div className="admin-filter-actions"><button className="admin-button primary">Aplicar filtros</button><Link className="admin-button secondary" href="/admin/comunidade">Limpar</Link></div>
    </form>
    {records.length ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Usuário</th><th>Artigo</th><th>Comentário</th><th>Status</th><th>Denúncias</th><th>Publicado</th><th>Ações</th></tr></thead><tbody>{records.map((item) => {
      const itemReports = reports.get(String(item.id)) ?? [];
      const publicUrl = `/legisbot/${encodeURIComponent(String(item.slug).toLowerCase())}/${encodeURIComponent(String(item.ordem))}#community-title`;
      const authorName = names.get(String(item.user_id)) ?? "Estudante Legis";
      const official = Boolean(item.publicado_como_equipe);
      return <tr key={String(item.id)}><td><strong>{official ? "Legis Flashcards ✓" : authorName}</strong>{official ? <small>Publicado por {authorName}</small> : null}</td><td><strong>{String(item.slug)}</strong><small>{String(item.ordem)}</small></td><td><div className="admin-community-content">{item.trecho_citado ? <mark>{String(item.trecho_citado)}</mark> : null}<p>{item.conteudo ? String(item.conteudo) : "Comentário removido."}</p></div></td><td><span className={`admin-status status-${String(item.status)}`}>{String(item.status)}</span></td><td>{itemReports.length ? <strong>{itemReports.length} pendente(s)</strong> : "—"}</td><td>{fmt(String(item.created_at))}</td><td><div className="admin-row-actions"><Link href={publicUrl} target="_blank">Página pública</Link>{String(item.status) !== "removido" ? <><form action={moderateCommunityComment}><input type="hidden" name="id" value={String(item.id)} /><input type="hidden" name="status" value="publicado" /><button>Restaurar</button></form><form action={moderateCommunityComment}><input type="hidden" name="id" value={String(item.id)} /><input type="hidden" name="status" value="em_analise" /><button>Em análise</button></form><form action={moderateCommunityComment}><input type="hidden" name="id" value={String(item.id)} /><input type="hidden" name="status" value="oculto" /><button>Ocultar</button></form><form action={moderateCommunityComment}><input type="hidden" name="id" value={String(item.id)} /><input type="hidden" name="status" value="removido" /><button>Remover</button></form></> : null}</div></td></tr>;
    })}</tbody></table></div> : <div className="admin-empty"><h2>Nenhum comentário encontrado</h2><p>Ajuste os filtros ou aguarde novas participações.</p></div>}
    <nav className="admin-pagination" aria-label="Paginação"><Link aria-disabled={page <= 1} className={page <= 1 ? "disabled" : ""} href={pageHref(query, page - 1)}>← Anterior</Link><span>Página {page} de {pages}</span><Link aria-disabled={page >= pages} className={page >= pages ? "disabled" : ""} href={pageHref(query, page + 1)}>Próxima →</Link></nav>
  </main>;
}
