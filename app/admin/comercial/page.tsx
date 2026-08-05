import Link from "next/link";
import { sairAdministrador } from "@/app/admin/actions";
import CommercialAdmin from "@/components/admin/commercial-admin";
import { exigirAdministrador } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function AdminCommercialPage() {
  const administrator = await exigirAdministrador();

  return <main className="admin-shell commercial-admin-shell">
    <Link className="admin-central-link" href="/admin">← Central Administrativa</Link>
    <header className="admin-header">
      <div>
        <div className="admin-eyebrow">Administração comercial</div>
        <h1>Gestão comercial</h1>
        <p>Gerencie leis, materiais, produtos, aquisições, liberações e auditoria.</p>
      </div>
      <div className="admin-header-actions">
        <span>{administrator.email}</span>
        <form action={sairAdministrador}><button className="admin-button secondary">Sair</button></form>
      </div>
    </header>
    <CommercialAdmin />
  </main>;
}
