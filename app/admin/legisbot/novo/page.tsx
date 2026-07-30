import LegisBotEditor from "@/components/admin/legisbot-editor";
import { exigirAdministrador } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function NovoComentarioLegisBotPage() {
  await exigirAdministrador();
  return <main className="admin-shell"><LegisBotEditor /></main>;
}
