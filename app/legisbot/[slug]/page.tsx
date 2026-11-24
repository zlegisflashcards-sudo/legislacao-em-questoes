import { CppPmalReadingClient } from "./cpp-pmal-reading-client";
import { isCppPmalReading } from "@/lib/legisbot/cpp-pmal-reading-policy";
import type { Metadata } from "next";
import { ContinuousReadingAuthorizedClient } from "./continuous-reading-authorized-client";
import type { LegisBotStudyTab } from "@/components/legisbot-study-tabs";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Lei Interativa | LegisFlashcards",
  description: "Estude a legislação por prioridade no mapa ou percorra a lei completa em leitura ativa.",
};

const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] ?? "" : value ?? "";
function initialTab(value: string): Exclude<LegisBotStudyTab, "questions"> { return value === "community" || value === "highlights" ? value : "legisbot"; }

export default async function ContinuousLegisBotPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  if (isCppPmalReading(slug, query.recorte_id)) return <CppPmalReadingClient />;
  if (Array.isArray(query.recorte_id) && query.recorte_id.some((id) => isCppPmalReading(slug, id))) {
    return <main className="mx-auto max-w-5xl px-4 py-8"><h1>Link de recorte inválido</h1><p>Abra a Lei Interativa pelo produto PMAL Soldado.</p></main>;
  }
  return <ContinuousReadingAuthorizedClient slug={slug} initialTab={initialTab(first(query.tab) || first(query.aba))} recorteId={query.recorte_id === undefined ? null : typeof query.recorte_id === "string" && query.recorte_id ? query.recorte_id : "recorte-invalido"} questionId={first(query.question_id)} ordem={first(query.ordem)} />;
}
