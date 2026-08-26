import Link from "next/link";
import { exigirAdministrador } from "@/lib/admin-auth";
import LawUpdateNoticesAdmin from "@/components/admin/law-update-notices-admin";
export const dynamic="force-dynamic";
export default async function Comunicacao(){await exigirAdministrador();return <main className="admin-shell commercial-admin-shell"><Link className="admin-central-link" href="/admin">← Central Administrativa</Link><header className="admin-header"><div><div className="admin-eyebrow">Comunicação</div><h1>Avisos por atualização de lei</h1><p>Revise rascunhos antes de publicar aos alunos.</p></div></header><LawUpdateNoticesAdmin/></main>}
