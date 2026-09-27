import Link from "next/link";
import { exigirAdministrador } from "@/lib/admin-auth";
import StudentCenter from "@/components/admin/student-center";
export const dynamic="force-dynamic";
export default async function StudentCenterPage(){await exigirAdministrador();return <main className="admin-shell commercial-admin-shell"><Link className="admin-central-link" href="/admin">← Central Administrativa</Link><StudentCenter/></main>;}
