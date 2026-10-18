import type { Metadata } from "next";
import { LawLegiscastPageClient } from "@/components/law-legiscast-page-client";
import { LawStudyBottomNav } from "@/components/law-study-bottom-nav";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "LegisCast | Legislação para Concursos", description: "PDF e áudios da legislação liberada para sua conta." };
export default async function LawLegiscastPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ recorte_id?: string }> }) { const [{ slug }, query] = await Promise.all([params, searchParams]); const recorteId = typeof query.recorte_id === "string" ? query.recorte_id : null; return <div className="pb-24 lg:pb-0"><LawLegiscastPageClient slug={slug} recorteId={recorteId} /><LawStudyBottomNav slug={slug} recorteId={recorteId} activeMode="legiscast" /></div>; }
