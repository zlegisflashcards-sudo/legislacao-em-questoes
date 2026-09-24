import Link from "next/link";
import { notFound } from "next/navigation";
import { LawOverviewCards } from "@/components/admin/law-overview-cards";
import { getAdminLawBySlug, getAdminLawOverview, getAdminLawOverviewChecks } from "@/lib/admin-law-center-server";

export default async function AdminLawOverviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const law = await getAdminLawBySlug((await params).slug);
  if (!law) notFound();
  const [overview, completed] = await Promise.all([getAdminLawOverview(law.id), getAdminLawOverviewChecks(law.id)]);
  const base = `/admin/leis/${encodeURIComponent(law.slug)}`;
  const situation = String(law.situacao_atualizacao ?? "");
  const editorialWarning = situation === "desatualizado" ? "Esta lei está marcada como desatualizada. Revise o conteúdo antes de novas publicações." : situation === "revisao_pendente" || situation === "em_revisao" ? "Esta lei está marcada para revisão. Verifique o conteúdo antes de novas publicações." : null;
  const cards = [
    { id: "estrutura" as const, label: "Estrutura", value: overview.structure, description: "nós estruturais", action: "Organizar estrutura", href: `${base}/estrutura` },
    { id: "materiais" as const, label: "Materiais", value: overview.materials, description: "materiais ativos", action: "Gerenciar materiais", href: `${base}/materiais` },
    { id: "legiscast" as const, label: "LegisCast", value: overview.audios, description: "áudios ativos", action: "Gerenciar áudios", href: `${base}/legiscast` },
    { id: "anki" as const, label: "Anki", value: "APKG", description: "importação e exportação", action: "Abrir ferramentas", href: `${base}/anki`, tool: true },
    { id: "questoes" as const, label: "Questões", value: overview.questions, description: "questões ativas", action: "Pesquisar questões", href: `${base}/questoes` },
    { id: "recortes" as const, label: "Recortes", value: overview.scopes, description: "recortes cadastrados", action: "Gerenciar recortes", href: `${base}/recortes` },
  ];
  return <section className="law-center-page" data-law-area="overview">
    <header className="law-center-page-heading"><div><p className="law-center-kicker">Visão geral</p><h2>Operação da lei</h2><p>Conteúdo ativo e atalhos para as tarefas mais frequentes.</p></div><div className="law-center-quick-actions"><Link className="admin-button primary" href={`${base}/questoes`}>Pesquisar questões</Link><Link className="admin-button secondary" href={`${base}/dados`}>Editar dados</Link></div></header>
    {editorialWarning ? <p className="admin-alert law-center-editorial-warning" role="status">{editorialWarning}</p> : null}
    <LawOverviewCards lawId={law.id} cards={cards} initialCompleted={completed} />
  </section>;
}
