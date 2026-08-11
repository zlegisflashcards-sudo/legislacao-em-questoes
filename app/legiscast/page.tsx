import type { Metadata } from "next";
import Image from "next/image";
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
          <div className="mx-auto w-full max-w-4xl overflow-hidden rounded-2xl border border-blue-300/20 bg-[#07101d] shadow-[0_24px_70px_rgba(0,0,0,0.38)]">
            <Image
              src="/images/legiscast-tv-cover.png"
              alt="Mévia e Tício apresentando o LegisCast em um estúdio de podcast."
              width={1680}
              height={943}
              priority
              sizes="(max-width: 640px) calc(100vw - 40px), (max-width: 1200px) calc(100vw - 48px), 1024px"
              className="h-auto w-full object-contain"
            />
          </div>

          <p className="max-w-3xl text-base leading-7 text-slate-300 sm:text-lg sm:leading-8">
            <strong className="font-black text-white">
              Mévia e Tício apresentam o LegisCast
            </strong>
            , uma aula em áudio em que explicam a legislação por meio de uma conversa
            leve e descontraída, destacando os principais pontos da lei de forma simples
            e fácil de acompanhar.
          </p>

          <LegiscastSearch
            items={items}
            afterSearch={
              <aside className="flex flex-col gap-3 rounded-xl border border-blue-300/20 bg-[#0f1d31] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm leading-6 text-slate-300">
                  Faça parte do nosso clube de membros e apoie este projeto.
                </p>
                <a
                  href={siteConfig.links.youtubeMembros}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg bg-blue-600 px-5 text-center text-sm font-black text-white shadow-[0_10px_24px_rgba(37,99,235,0.22)] transition hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300"
                >
                  Seja membro do canal
                </a>
              </aside>
            }
          />
        </div>
      </div>
    </div>
  );
}
