import Link from "next/link";
import { RecordsContestImage } from "@/components/records-contest-image";
import type { LeagueRankingData } from "@/lib/league-ranking-server";

export function RecordsPage({ pmma }: { pmma: LeagueRankingData | null }) {
  return <main className="min-h-screen bg-[#020817] px-4 py-10 text-slate-100 sm:px-6 lg:py-16">
    <div className="mx-auto max-w-5xl">
      <header className="max-w-2xl">
        <p className="font-mono text-xs font-black tracking-[.3em] text-cyan-300">LEGIS QUESTÕES</p>
        <h1 className="mt-2 text-4xl font-black tracking-tight text-white sm:text-6xl">Records</h1>
        <p className="mt-4 text-base leading-relaxed text-slate-300 sm:text-lg">Escolha um concurso e veja os melhores desempenhos.</p>
      </header>

      {pmma ? <section className="mt-8 max-w-xl">
        <Link href="/recordes/pmma" className="group flex min-h-40 items-center gap-5 rounded-[1.75rem] border border-cyan-300/30 bg-[#071329] p-5 shadow-[0_0_42px_rgba(6,182,212,.1)] transition hover:-translate-y-0.5 hover:border-cyan-200/70 hover:shadow-[0_0_48px_rgba(34,211,238,.2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-300 sm:p-6">
          <RecordsContestImage src={pmma.league.contestImageUrl} alt="Imagem PMMA" className="h-20 w-20 shrink-0 rounded-2xl border border-cyan-200/25 object-cover object-right sm:h-24 sm:w-24" />
          <span className="min-w-0 flex-1"><span className="block text-2xl font-black text-white">PMMA</span><span className="mt-1 block text-sm leading-relaxed text-slate-300">Polícia Militar do Maranhão</span><span className="mt-4 inline-flex text-sm font-black text-cyan-300 underline underline-offset-4">Ver ranking <span aria-hidden="true" className="ml-1 transition group-hover:translate-x-1">→</span></span></span>
        </Link>
      </section> : <p className="mt-8 rounded-2xl border border-cyan-200/15 bg-[#071329] p-5 text-slate-300">O ranking PMMA está indisponível no momento.</p>}
    </div>
  </main>;
}
