import Link from "next/link";
import { sairAdministrador } from "@/app/admin/actions";
import PostSalePendingCenter from "@/components/admin/post-sale-pending-center";
import { exigirAdministrador } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function PostSalePendingPage() {
  const administrator = await exigirAdministrador();
  return <main className="admin-shell commercial-admin-shell">
    <Link className="admin-central-link" href="/admin">← Central Administrativa</Link>
    <header className="admin-header"><div><div className="admin-eyebrow">Administração</div><h1>Central de Pendências</h1><p>Diagnóstico e preparação operacional do pós-venda.</p></div><div className="admin-header-actions"><span>{administrator.email}</span><form action={sairAdministrador}><button className="admin-button secondary">Sair</button></form></div></header>
    <PostSalePendingCenter />
  </main>;
}
