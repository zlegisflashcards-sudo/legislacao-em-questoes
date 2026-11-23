import { ScopedStudyMaterial } from "@/components/scoped-study-material";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { LawLegiscastPageClient } from "@/components/law-legiscast-page-client";
import { LawStudyBottomNav } from "@/components/law-study-bottom-nav";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "LegisCast | Legislação para Concursos", description: "Áudios da legislação liberada para sua conta." };
export default async function LawLegiscastPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ recorte_id?: string | string[] }> }) { const [{ slug }, query] = await Promise.all([params, searchParams]); if (query.recorte_id !== undefined && (typeof query.recorte_id !== "string" || !query.recorte_id.trim())) notFound(); const studyRecorteId = typeof query.recorte_id === "string" ? query.recorte_id : null; if (studyRecorteId) return <ScopedStudyMaterial slug={slug} recorteId={studyRecorteId} mode="audio" />; return <div className="pb-24 lg:pb-0"><LawLegiscastPageClient slug={slug} /><LawStudyBottomNav slug={slug} recorteId={studyRecorteId} activeMode="legiscast" /></div>; }
