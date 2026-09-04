import { LawAnkiPageClient } from "@/components/law-anki-page-client";
import { getAnkiTutorialSettings } from "@/lib/anki-tutorial-settings-server";

export const dynamic = "force-dynamic";
export default async function LawAnkiPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ recorte_id?: string }> }) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  return <LawAnkiPageClient slug={slug} recorteId={typeof query.recorte_id === "string" ? query.recorte_id : null} settings={await getAnkiTutorialSettings()} />;
}
