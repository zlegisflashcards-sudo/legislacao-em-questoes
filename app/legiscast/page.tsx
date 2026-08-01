import type { Metadata } from "next";
import { LegiscastSearch } from "@/components/legiscast-search";
import { criarItemLegiscast, type LegiscastItem } from "@/lib/legiscast";
import { getLegislacoes } from "@/lib/legislacoes";

export const metadata: Metadata = {
  title: "LegisCast TV | LegisFlashcards",
  description: "Encontre uma legislação e acesse sua Central de Estudos.",
};

export const revalidate = 300;

export default async function LegiscastPage() {
  const legislacoes = await getLegislacoes();
  const items = legislacoes.reduce<LegiscastItem[]>((result, legislacao) => {
    const item = criarItemLegiscast(legislacao);
    if (item) result.push(item);
    return result;
  }, []);

  return (
    <div className="min-h-full bg-[linear-gradient(180deg,#07101d_0%,#091525_55%,#070b12_100%)] text-white">
      <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-6 sm:py-14">
        <div className="space-y-8">
          <div className="space-y-3">
            <p className="text-sm font-black uppercase tracking-[0.2em] text-[#28b7ff]">
              Centrais de Estudos
            </p>
            <h1 className="text-4xl font-black tracking-tight text-white sm:text-5xl">
              LegisCast TV
            </h1>
            <p className="max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
              Encontre uma legislação e acesse sua Central de Estudos.
            </p>
          </div>
          <LegiscastSearch items={items} />
        </div>
      </div>
    </div>
  );
}
