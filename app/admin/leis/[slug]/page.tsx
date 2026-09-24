import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminLawBySlug, getAdminLawOverview } from "@/lib/admin-law-center-server";

export default async function AdminLawOverviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const law = await getAdminLawBySlug((await params).slug);
  if (!law) notFound();
  const overview = await getAdminLawOverview(law.id);
  const base = `/admin/leis/${encodeURIComponent(law.slug)}`;
  return <section className="law-center-page" data-law-area="overview">
    <header className="law-center-page-heading"><div><p className="law-center-kicker">Visão geral</p><h2>Operação da lei</h2><p>Conteúdo ativo e atalhos para as tarefas mais frequentes.</p></div><div className="law-center-quick-actions"><Link className="admin-button primary" href={`${base}/questoes`}>Pesquisar questões</Link><Link className="admin-button secondary" href={`${base}/dados`}>Editar dados</Link></div></header>
    <section className="law-center-overview-grid" aria-label="Resumo operacional">
      <Link className="law-center-operation-card" href={`${base}/estrutura`}><span className="law-center-card-label">Estrutura</span><strong>{overview.structure}</strong><span>nós estruturais</span><b>Organizar estrutura <span aria-hidden="true">→</span></b></Link>
      <Link className="law-center-operation-card" href={`${base}/materiais`}><span className="law-center-card-label">Materiais</span><strong>{overview.materials}</strong><span>materiais ativos</span><b>Gerenciar materiais <span aria-hidden="true">→</span></b></Link>
      <Link className="law-center-operation-card" href={`${base}/legiscast`}><span className="law-center-card-label">LegisCast</span><strong>{overview.audios}</strong><span>áudios ativos</span><b>Gerenciar áudios <span aria-hidden="true">→</span></b></Link>
      <Link className="law-center-operation-card law-center-operation-card-tool" href={`${base}/anki`}><span className="law-center-card-label">Anki</span><strong aria-hidden="true">APKG</strong><span>importação e exportação</span><b>Abrir ferramentas <span aria-hidden="true">→</span></b></Link>
      <Link className="law-center-operation-card" href={`${base}/questoes`}><span className="law-center-card-label">Questões</span><strong>{overview.questions}</strong><span>questões ativas</span><b>Pesquisar questões <span aria-hidden="true">→</span></b></Link>
      <Link className="law-center-operation-card" href={`${base}/recortes`}><span className="law-center-card-label">Recortes</span><strong>{overview.scopes}</strong><span>recortes cadastrados</span><b>Gerenciar recortes <span aria-hidden="true">→</span></b></Link>
    </section>
  </section>;
}
