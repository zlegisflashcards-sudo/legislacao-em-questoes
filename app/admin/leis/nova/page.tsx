import Link from "next/link";
import { LawDataAdmin } from "@/components/admin/law-data-admin";
import { exigirAdministrador } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function NewAdminLawPage() {
  await exigirAdministrador();
  return <main className="admin-shell commercial-admin-shell">
    <Link className="admin-central-link" href="/admin/leis">← Central das Leis</Link>
    <header className="admin-header"><div><div className="admin-eyebrow">Central da Lei</div><h1>Nova lei</h1><p>Cadastre a lei com os mesmos campos e validações do Admin Comercial.</p></div></header>
    <LawDataAdmin law={null} />
  </main>;
}
