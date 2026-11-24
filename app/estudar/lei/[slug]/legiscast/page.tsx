import type { Metadata } from "next";
import { LawLegiscastPageClient } from "@/components/law-legiscast-page-client";
import { LawStudyBottomNav } from "@/components/law-study-bottom-nav";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "LegisCast | Legislação para Concursos", description: "Áudios da legislação liberada para sua conta." };
export default async function LawLegiscastPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ recorte_id?: string | string[] }> }) { const [{ slug }, query] = await Promise.all([params, searchParams]); const studyRecorteId = query.recorte_id === undefined ? null : typeof query.recorte_id === "string" && query.recorte_id ? query.recorte_id : "recorte-invalido"; return <div className="pb-24 lg:pb-0">{studyRecorteId === null ? <LawLegiscastPageClient slug={slug} /> : <main className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6"><h1>LegisCast do recorte</h1><p>As faixas específicas deste recorte ainda não estão disponíveis.</p></main>}<LawStudyBottomNav slug={slug} recorteId={studyRecorteId} activeMode="legiscast" /></div>; }
