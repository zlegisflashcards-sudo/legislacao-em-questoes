import type { Metadata } from "next";
import { LegiscastSearch } from "@/components/legiscast-search";
import { criarItemLegiscast, type LegiscastItem } from "@/lib/legiscast";
import { getLegislacoes } from "@/lib/legislacoes";
import { siteConfig } from "@/lib/site-config";

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
            <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:items-center">
              <a
                href={siteConfig.links.youtubeMembros}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-600 px-5 text-center text-sm font-black text-white shadow-[0_10px_24px_rgba(37,99,235,0.22)] transition hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300"
              >
                Seja membro do canal
              </a>
              <a
                href={siteConfig.links.youtubeMembros}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-blue-300/25 px-5 text-center text-sm font-bold text-blue-100 transition hover:border-blue-300/45 hover:bg-blue-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300"
              >
                Apoie este projeto
              </a>
            </div>
          </div>
          <LegiscastSearch items={items} />
        </div>
      </div>
    </div>
  );
}
