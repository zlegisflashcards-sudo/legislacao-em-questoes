import { LawAnkiPageClient } from "@/components/law-anki-page-client";
import { getAnkiTutorialSettings } from "@/lib/anki-tutorial-settings-server";
import { LawStudyBottomNav } from "@/components/law-study-bottom-nav";

export const dynamic = "force-dynamic";
export default async function LawAnkiPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ recorte_id?: string }> }) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const recorteId = typeof query.recorte_id === "string" ? query.recorte_id : null;
  return <div className="pb-24 lg:pb-0"><LawAnkiPageClient slug={slug} recorteId={recorteId} settings={await getAnkiTutorialSettings()} /><LawStudyBottomNav slug={slug} recorteId={recorteId} activeMode="anki" /></div>;
}
