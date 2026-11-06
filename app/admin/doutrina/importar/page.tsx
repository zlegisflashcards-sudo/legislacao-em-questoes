import Link from "next/link";
import { DoctrineImportAdmin } from "@/components/admin/doctrine-import-admin";
import { exigirAdministrador } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function DoctrineImportPage() {
  await exigirAdministrador();
  return <main className="admin-shell commercial-admin-shell">
    <Link className="admin-central-link" href="/admin/leis">← Central das Leis</Link>
    <DoctrineImportAdmin />
  </main>;
}
