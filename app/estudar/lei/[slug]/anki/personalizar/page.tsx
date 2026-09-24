import { LawAnkiCustomizerClient } from "@/components/law-anki-customizer-client";
export const dynamic = "force-dynamic";
export default async function Page({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ recorte_id?: string }> }) { const [{ slug }, query] = await Promise.all([params, searchParams]); return <LawAnkiCustomizerClient slug={slug} recorteId={typeof query.recorte_id === "string" ? query.recorte_id : null} />; }
