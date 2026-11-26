import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirAdministrador } from "@/lib/admin-auth";
import { getAdminLawBySlug } from "@/lib/admin-law-center-server";
import { getAdminLawAnkiWarningSummary } from "@/lib/admin-questoes-server";
import { publicationStatusLabel } from "@/lib/publication-status";
import { LawContextNavigation } from "@/components/admin/law-context-navigation";

export const dynamic = "force-dynamic";

export default async function AdminLawLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  await exigirAdministrador();
  const { slug } = await params;
  const law = await getAdminLawBySlug(slug);
  if (!law) notFound();
  const ankiWarnings = await getAdminLawAnkiWarningSummary(law.slug);
  const base = `/admin/leis/${encodeURIComponent(law.slug)}`;
  const navigation = () => <><Link data-law-nav="overview" href={base}>Visão geral</Link><Link data-law-nav="dados" href={`${base}/dados`}>Dados da lei</Link><Link data-law-nav="estrutura" href={`${base}/estrutura`}>Estrutura</Link><Link data-law-nav="materiais" href={`${base}/materiais`}>Legislação</Link><Link data-law-nav="legiscast" href={`${base}/legiscast`}>LegisCast</Link><Link data-law-nav="questoes" href={`${base}/questoes`}>Questões</Link><Link data-law-nav="anki" href={`${base}/anki`}>Anki{ankiWarnings.missingTotalArtigos ? <span className="ml-2 inline-grid size-5 place-items-center rounded-full bg-red-600 text-xs leading-none text-white" title="Total de artigos para Anki não informado no cadastro da lei" aria-label="Total de artigos para Anki não informado no cadastro da lei">!</span> : null}</Link><Link data-law-nav="recortes" href={`${base}/recortes`}>Recortes</Link></>;
  return <main className="admin-shell commercial-admin-shell law-center-shell">
    <nav className="law-center-breadcrumb" aria-label="Breadcrumb"><Link href="/admin">Administração</Link><span aria-hidden="true">/</span><Link href="/admin/leis">Leis</Link><span aria-hidden="true">/</span><span aria-current="page">Central</span></nav>
    <header className="admin-header law-center-header"><div><div className="admin-eyebrow">Central da Lei</div><h1>{law.titulo}</h1><p>{law.codigo ? `${String(law.codigo)} · ` : ""}<strong className={law.status_publicacao === "ativa" ? "is-active" : law.status_publicacao === "em_breve" ? "is-soon" : "is-inactive"}>{publicationStatusLabel(law.status_publicacao)}</strong></p></div><LawContextNavigation lawId={law.id} listLabel="Trocar lei" /></header>
    <nav className="law-center-nav" aria-label="Áreas da Central da Lei">{navigation()}</nav>
    <details className="law-center-nav-mobile"><summary>Navegar pelas áreas da lei</summary><nav aria-label="Áreas da Central da Lei no celular">{navigation()}</nav></details>
    <div className="law-center-content">{children}</div>
  </main>;
}
