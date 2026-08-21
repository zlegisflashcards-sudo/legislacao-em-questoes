import Link from "next/link";
import CoachAdmin from "@/components/admin/coach-admin";
import { exigirAdministrador } from "@/lib/admin-auth";
export const dynamic="force-dynamic";
export default async function CoachPage(){await exigirAdministrador();return <main className="admin-shell commercial-admin-shell"><Link className="admin-central-link" href="/admin">← Central Administrativa</Link><header className="admin-header"><div><div className="admin-eyebrow">Administração</div><h1>Painel de Coach</h1><p>Acompanhamento pedagógico dos alunos.</p></div></header><CoachAdmin/></main>}
