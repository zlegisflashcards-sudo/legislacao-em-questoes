import Link from "next/link";
import { LegiscastAudiosAdmin } from "@/components/admin/legiscast-audios-admin";
import { exigirAdministrador } from "@/lib/admin-auth";
export const dynamic = "force-dynamic";
export default async function LegiscastAudiosPage() { await exigirAdministrador(); return <main className="admin-shell"><Link className="admin-central-link" href="/admin">← Central Administrativa</Link><header className="admin-header"><div><div className="admin-eyebrow">LegisCast</div><h1>Áudios</h1><p>Envie e organize as faixas privadas por legislação.</p></div></header><LegiscastAudiosAdmin /></main>; }
