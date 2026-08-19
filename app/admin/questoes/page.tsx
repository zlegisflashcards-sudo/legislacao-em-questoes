import Link from "next/link";
import { sairAdministrador } from "@/app/admin/actions";
import AdminQuestoes from "@/components/admin/admin-questoes";
import { exigirAdministrador } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
export default async function AdminQuestoesPage() {
  const administrator = await exigirAdministrador();
  return <main className="admin-shell commercial-admin-shell"><Link className="admin-central-link" href="/admin">← Central Administrativa</Link><header className="admin-header"><div><div className="admin-eyebrow">Legis Questões</div><h1>Banco de questões</h1><p>Cadastre e gerencie questões vinculadas às leis ativas da plataforma.</p></div><div className="admin-header-actions"><span>{administrator.email}</span><form action={sairAdministrador}><button className="admin-button secondary">Sair</button></form></div></header><AdminQuestoes /></main>;
}
