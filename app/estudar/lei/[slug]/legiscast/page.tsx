import type { Metadata } from "next";
import { LawLegiscastPageClient } from "@/components/law-legiscast-page-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "LegisCast | Legislação para Concursos", description: "PDF e áudios da legislação liberada para sua conta." };
export default async function LawLegiscastPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ recorte_id?: string }> }) { const [{ slug }, query] = await Promise.all([params, searchParams]); return <LawLegiscastPageClient slug={slug} recorteId={typeof query.recorte_id === "string" ? query.recorte_id : null} />; }
