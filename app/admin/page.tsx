import Link from "next/link";
import { sairAdministrador } from "@/app/admin/actions";
import { exigirAdministrador } from "@/lib/admin-auth";
import AdminNotificationBell from "@/components/admin/admin-notification-bell";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const panels = [
  { href: "/admin/coach", icon: "🧭", title: "Painel de Coach", description: "Acompanhe alunos e campanhas." },
  {
    href: "/admin/alunos",
    icon: "👥",
    title: "Alunos",
    description: "Consulte fichas de alunos, acessos, comunicação e o Mini-CRM de pós-venda.",
  },
  {
    href: "/admin/comercial",
    icon: "🧾",
    title: "Gestão comercial",
    description: "Gerencie o catálogo interno, aquisições, liberações e a trilha de auditoria.",
  },
  {
    href: "/admin/comunicacao",
    icon: "📣",
    title: "Comunicação",
    description: "Revise avisos de atualização antes de entregá-los aos alunos.",
  },
  {
    href: "/admin/questoes",
    icon: "✅",
    title: "Legis Questões",
    description: "Cadastre e gerencie as questões vinculadas às leis ativas da plataforma.",
  },
  {
    href: "/admin/legisbot",
    icon: "🤖",
    title: "Painel do LegisBot",
    description: "Gerencie, revise e edite os comentários produzidos pelo LegisBot.",
  },
  {
    href: "/admin/comunidade",
    icon: "👥",
    title: "Painel da Comunidade",
    description: "Modere os comentários, respostas e denúncias publicadas pelos alunos.",
  },
] as const;

export default async function AdminPage() {
  const administrator = await exigirAdministrador();
  const pending = await getSupabaseServerClient().from("law_update_notices").select("id", { count: "exact", head: true }).eq("status", "draft");

  return <main className="admin-shell admin-hub">
    <header className="admin-header admin-hub-header">
      <div>
        <div className="admin-eyebrow">Administração</div>
        <h1>Central Administrativa</h1>
        <p>Escolha o painel que deseja acessar.</p>
      </div>
      <div className="admin-header-actions">
        <AdminNotificationBell />
        <span>{administrator.email}</span>
        <form action={sairAdministrador}><button className="admin-button secondary">Sair</button></form>
      </div>
    </header>

    <section className="admin-hub-grid" aria-label="Painéis administrativos">
      {panels.map((panel) => <article className="admin-hub-card" key={panel.href}>
        <div className="admin-hub-icon" aria-hidden="true">{panel.icon}</div>
        <div>
          <h2>{panel.title}</h2>
          <p>{panel.description}</p>
        </div>
        <Link className="admin-button primary" href={panel.href}>Acessar painel{panel.href === "/admin/comunicacao" && pending.count ? ` (${pending.count})` : ""}</Link>
      </article>)}
    </section>
  </main>;
}
