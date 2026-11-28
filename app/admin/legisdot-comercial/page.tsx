import Link from "next/link";
import { sairAdministrador } from "@/app/admin/actions";
import LegisDotCommercial from "@/components/admin/legisdot-comercial";
import { exigirAdministrador } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function LegisDotCommercialPage() {
  const administrator = await exigirAdministrador();

  return <main className="admin-shell commercial-admin-shell">
    <Link className="admin-central-link" href="/admin">← Central Administrativa</Link>
    <header className="admin-header">
      <div>
        <div className="admin-eyebrow">Atendimento e vendas</div>
        <h1>LegisDot Comercial</h1>
        <p>Teste o atendimento, acompanhe conversas e prepare a conexão com o WhatsApp.</p>
      </div>
      <div className="admin-header-actions">
        <span>{administrator.email}</span>
        <form action={sairAdministrador}><button className="admin-button secondary">Sair</button></form>
      </div>
    </header>
    <LegisDotCommercial />
  </main>;
}
