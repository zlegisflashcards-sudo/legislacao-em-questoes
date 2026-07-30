import Link from "next/link";
import CopyButton from "@/components/admin/copy-button";
import { alterarStatusComentario, sairAdministrador } from "@/app/admin/actions";
import { exigirAdministrador } from "@/lib/admin-auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { LEGISBOT_COMENTARIO_STATUS, type LegisBotComentario } from "@/lib/legisbot-comentario";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 20;

type Query = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] ?? "" : value ?? "";
const fmt = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
const statusLabels = { pendente: "Rascunho / pendente", processando: "Processando", concluido: "Publicado", erro: "Erro" } as const;

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
  const page = Math.max(1, Number(one(query.page)) || 1);
  const start = (page - 1) * PAGE_SIZE;

  let request = getSupabaseServerClient().from("legisbot_comentarios").select("*", { count: "exact" });
  if (search) {
    const value = `%${search}%`;
    request = request.or(`titulo.ilike.${value},slug.ilike.${value},ordem.ilike.${value},assunto.ilike.${value},legislacao.ilike.${value},comentario.ilike.${value}`);
  }
  if (status && LEGISBOT_COMENTARIO_STATUS.includes(status as (typeof LEGISBOT_COMENTARIO_STATUS)[number])) {
    request = request.eq("status", status);
  }
  const { data, error, count } = await request.order("updated_at", { ascending: false }).range(start, start + PAGE_SIZE - 1);
  if (error) throw new Error(error.message);
  const records = (data ?? []) as LegisBotComentario[];
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  return <main className="admin-shell">
    <Link className="admin-central-link" href="/admin">← Central Administrativa</Link>
    <header className="admin-header">
      <div>
        <div className="admin-eyebrow">Administração</div>
        <h1>Comentários do LegisBot</h1>
        <p>{count ?? 0} registro(s), ordenados pela atualização mais recente.</p>
      </div>
      <div className="admin-header-actions">
        <Link className="admin-button primary" href="/admin/legisbot/novo">+ Adicionar comentário</Link>
        <span>{user.email}</span>
        <form action={sairAdministrador}><button className="admin-button secondary">Sair</button></form>
      </div>
    </header>

    {one(query.excluido) ? <div className="admin-alert success">Comentário excluído com sucesso.</div> : null}
    {one(query.erro_status) ? <div className="admin-alert error">O comentário precisa ter conteúdo antes de ser publicado.</div> : null}

    <form className="admin-filters admin-filters-compact">
      <label className="admin-search">Buscar
        <input name="q" defaultValue={search} placeholder="Lei, título, artigo, assunto, slug, ordem ou conteúdo" />
      </label>
      <label>Status
        <select name="status" defaultValue={status}>
          <option value="">Todos</option>
          {LEGISBOT_COMENTARIO_STATUS.map((item) => <option key={item} value={item}>{statusLabels[item]}</option>)}
        </select>
      </label>
      <div className="admin-filter-actions">
        <button className="admin-button primary">Buscar</button>
        <Link className="admin-button secondary" href="/admin/legisbot">Limpar</Link>
      </div>
    </form>

    {records.length ? <div className="admin-table-wrap">
      <table className="admin-table admin-legisbot-table">
        <thead><tr><th>Lei ou título</th><th>Artigo</th><th>Assunto</th><th>Slug</th><th>Ordem</th><th>Status</th><th>Atualizado</th><th>Ações</th></tr></thead>
        <tbody>{records.map((item) => {
          const publicUrl = `/legisbot/${encodeURIComponent(item.slug.toLowerCase())}/${encodeURIComponent(item.ordem)}`;
          const nextStatus = item.status === "concluido" ? "pendente" : "concluido";
          return <tr key={item.id}>
            <td><strong>{item.titulo}</strong><small>ID {item.id}</small></td>
            <td>Art. {item.ordem}</td>
            <td>{item.assunto}</td>
            <td><code>{item.slug}</code></td>
            <td>{item.ordem}</td>
            <td><span className={`admin-status status-${item.status}`}>{statusLabels[item.status]}</span></td>
            <td>{fmt(item.updated_at)}</td>
            <td><div className="admin-row-actions">
              <Link href={`/admin/legisbot/${item.id}`}>Editar</Link>
              {item.status === "concluido" ? <Link href={publicUrl} target="_blank">Abrir página pública</Link> : null}
              <CopyButton value={publicUrl} label="Copiar link" />
              <form action={alterarStatusComentario}>
                <input type="hidden" name="id" value={item.id} />
                <input type="hidden" name="status" value={nextStatus} />
                <button className="admin-link-button" title={nextStatus === "concluido" ? "Publicar comentário" : "Retirar da publicação"}>
                  {nextStatus === "concluido" ? "Publicar" : "Salvar como rascunho"}
                </button>
              </form>
            </div></td>
          </tr>;
        })}</tbody>
      </table>
    </div> : <div className="admin-empty"><h2>Nenhum resultado encontrado</h2><p>Ajuste a busca ou o filtro de status.</p></div>}

    <nav className="admin-pagination" aria-label="Paginação">
      <Link aria-disabled={page <= 1} className={page <= 1 ? "disabled" : ""} href={queryString(query, { page: String(page - 1) })}>← Anterior</Link>
      <span>Página {page} de {pages}</span>
      <Link aria-disabled={page >= pages} className={page >= pages ? "disabled" : ""} href={queryString(query, { page: String(page + 1) })}>Próxima →</Link>
    </nav>
  </main>;
}
