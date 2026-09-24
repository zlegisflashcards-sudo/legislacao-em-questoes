import { redirect } from "next/navigation";
import { exigirAdministrador } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

/** Compatibilidade para links antigos; a gestão de áudios agora é contextual à lei. */
export default async function LegacyLegiscastAudiosPage() {
  await exigirAdministrador();
  redirect("/admin/leis");
}
