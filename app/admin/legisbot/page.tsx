import Link from "next/link";
import CopyButton from "@/components/admin/copy-button";
import { sairAdministrador } from "@/app/admin/actions";
import { exigirAdministrador } from "@/lib/admin-auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { LEGISBOT_COMENTARIO_STATUS, type LegisBotComentario } from "@/lib/legisbot-comentario";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 20;

type Query = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] ?? "" : value ?? "";
const fmt = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));

function queryString(query: Query, changes: Record<string, string>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (one(value)) params.set(key, one(value));
  for (const [key, value] of Object.entries(changes)) value ? params.set(key, value) : params.delete(key);
  return `?${params.toString()}`;
}

export default async function AdminLegisBotPage({ searchParams }: { searchParams: Promise<Query> }) {
  const [query, user] = await Promise.all([searchParams, exigirAdministrador()]);
  const search = one(query.q).trim().replace(/[,%()]/g, " ");
  const status = one(query.status);
  const slug = one(query.slug).trim();
  const modelo = one(query.modelo).trim();
  const dataInicio = one(query.data_inicio);
  const dataFim = one(query.data_fim);
  const conteudo = one(query.conteudo);
  const page = Math.max(1, Number(one(query.page)) || 1);
  const start = (page - 1) * PAGE_SIZE;

  let request = getSupabaseServerClient().from("legisbot_comentarios").select("*", { count: "exact" });
  if (search) {
    const value = `%${search}%`;
    request = request.or(`titulo.ilike.${value},slug.ilike.${value},ordem.ilike.${value},assunto.ilike.${value},legislacao.ilike.${value},comentario.ilike.${value}`);
  }
  if (status) request = request.eq("status", status);
  if (slug) request = request.ilike("slug", `%${slug}%`);
  if (modelo) request = request.ilike("modelo_ia", `%${modelo}%`);
  if (dataInicio) request = request.gte("updated_at", `${dataInicio}T00:00:00`);
  if (dataFim) request = request.lte("updated_at", `${dataFim}T23:59:59.999`);
  if (conteudo === "com") request = request.not("comentario", "is", null).neq("comentario", "");
  if (conteudo === "sem") request = request.or("comentario.is.null,comentario.eq.");
  if (conteudo === "erro") request = request.eq("status", "erro");
  const { data, error, count } = await request.order("updated_at", { ascending: false }).range(start, start + PAGE_SIZE - 1);
  if (error) throw new Error(error.message);
  const records = (data ?? []) as LegisBotComentario[];
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  return <main className="admin-shell">
    <Link className="admin-central-link" href="/admin">← Central Administrativa</Link>
    <header className="admin-header"><div><div className="admin-eyebrow">Administração</div><h1>Comentários do LegisBot</h1><p>{count ?? 0} registro(s) encontrado(s)</p></div><div className="admin-header-actions"><Link className="admin-button secondary" href="/admin/comunidade">Comentários da comunidade</Link><span>{user.email}</span><form action={sairAdministrador}><button className="admin-button secondary">Sair</button></form></div></header>
    {one(query.excluido) ? <div className="admin-alert success">Comentário excluído com sucesso.</div> : null}
    <form className="admin-filters">
      <label className="admin-search">Buscar<input name="q" defaultValue={search} placeholder="Título, slug, ordem, assunto, legislação ou comentário" /></label>
      <label>Status<select name="status" defaultValue={status}><option value="">Todos</option>{LEGISBOT_COMENTARIO_STATUS.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label>Slug<input name="slug" defaultValue={slug} placeholder="Ex.: CF" /></label>
      <label>Modelo de IA<input name="modelo" defaultValue={modelo} placeholder="Ex.: gpt-5" /></label>
      <label>De<input name="data_inicio" type="date" defaultValue={dataInicio} /></label>
      <label>Até<input name="data_fim" type="date" defaultValue={dataFim} /></label>
      <label>Conteúdo<select name="conteudo" defaultValue={conteudo}><option value="">Todos</option><option value="com">Com comentário</option><option value="sem">Sem comentário</option><option value="erro">Com erro</option></select></label>
      <div className="admin-filter-actions"><button className="admin-button primary">Aplicar filtros</button><Link className="admin-button secondary" href="/admin/legisbot">Limpar</Link></div>
    </form>
    {records.length ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Legislação</th><th>Ordem</th><th>Assunto</th><th>Status</th><th>Modelo</th><th>Criado</th><th>Atualizado</th><th>Ações</th></tr></thead><tbody>{records.map((item) => {
      const publicUrl = `/legisbot/${encodeURIComponent(item.slug.toLowerCase())}/${encodeURIComponent(item.ordem)}`;
      return <tr key={item.id}><td><strong>{item.titulo}</strong><small>{item.slug}</small></td><td>{item.ordem}</td><td>{item.assunto}</td><td><span className={`admin-status status-${item.status}`}>{item.status}</span></td><td>{item.modelo_ia || "—"}</td><td>{fmt(item.created_at)}</td><td>{fmt(item.updated_at)}</td><td><div className="admin-row-actions"><Link href={`/admin/legisbot/${item.id}`}>Visualizar</Link><Link href={`/admin/legisbot/${item.id}#editor-html`}>Editar</Link><Link href={publicUrl} target="_blank">Página pública</Link><CopyButton value={publicUrl} label="Copiar link" /></div></td></tr>;
    })}</tbody></table></div> : <div className="admin-empty"><h2>Nenhum resultado encontrado</h2><p>Ajuste os termos de busca ou remova alguns filtros.</p></div>}
    <nav className="admin-pagination" aria-label="Paginação"><Link aria-disabled={page <= 1} className={page <= 1 ? "disabled" : ""} href={queryString(query, { page: String(page - 1) })}>← Anterior</Link><span>Página {page} de {pages}</span><Link aria-disabled={page >= pages} className={page >= pages ? "disabled" : ""} href={queryString(query, { page: String(page + 1) })}>Próxima →</Link></nav>
  </main>;
}
