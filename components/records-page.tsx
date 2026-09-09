import Link from "next/link";
import { RecordsContestImage } from "@/components/records-contest-image";
import type { RecordsRankingData } from "@/lib/records-ranking-server";

const steps = [
  { number: "01", title: "Escolha o concurso", detail: "Entre na unidade que representa o seu edital.", icon: "⌖" },
  { number: "02", title: "Resolva as questões", detail: "Conquiste seus melhores resultados nas leis.", icon: "✦" },
  { number: "03", title: "Suba no ranking", detail: "Dispute posição entre os destaques da tropa.", icon: "↑" },
];

export function RecordsPage({ contests }: { contests: RecordsRankingData[] }) {
  return <main className="min-h-screen overflow-hidden bg-[#020817] px-4 py-6 text-slate-100 sm:px-6 sm:py-10 lg:py-16">
    <div className="mx-auto max-w-6xl">
      <header className="relative isolate overflow-hidden rounded-[2rem] border border-cyan-300/25 bg-[#06152c] px-6 py-9 shadow-[0_0_80px_rgba(14,165,233,.13)] sm:px-10 sm:py-14">
        <div aria-hidden="true" className="absolute inset-0 -z-20 opacity-70 [background-image:linear-gradient(rgba(56,189,248,.07)_1px,transparent_1px),linear-gradient(90deg,rgba(56,189,248,.07)_1px,transparent_1px)] [background-size:28px_28px]" />
        <div aria-hidden="true" className="absolute -right-24 top-0 -z-10 h-64 w-64 rounded-full bg-cyan-400/15 blur-3xl" />
        <div aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200 to-transparent" />
        <p className="font-mono text-[11px] font-black tracking-[.32em] text-cyan-300">OPERAÇÃO · HALL OF FAME</p>
        <h1 className="mt-3 text-5xl font-black tracking-[.04em] text-white sm:text-7xl">RECORDS</h1>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-slate-200 sm:text-lg">Acompanhe os melhores desempenhos da comunidade Legis Flashcards. Escolha um concurso e veja quem está se destacando.</p>
        <div className="mt-7 inline-flex items-center gap-2 rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1.5 text-xs font-black uppercase tracking-wider text-amber-200"><span aria-hidden="true">★</span> Galeria de elite</div>
      </header>

      <section className="mt-6 grid gap-3 sm:grid-cols-3 sm:gap-4" aria-labelledby="como-funciona">
        <h2 id="como-funciona" className="sr-only">Como funciona</h2>
        {steps.map((step) => <article key={step.number} className="relative overflow-hidden rounded-2xl border border-cyan-200/15 bg-[#071329] p-5 shadow-[0_0_30px_rgba(6,182,212,.06)]">
          <span aria-hidden="true" className="absolute right-4 top-3 font-mono text-5xl font-black text-cyan-100/[.05]">{step.number}</span>
          <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-300/30 bg-cyan-300/10 font-black text-cyan-200">{step.icon}</div>
          <h3 className="mt-4 font-black text-white">{step.title}</h3>
          <p className="mt-1 text-sm leading-relaxed text-slate-400">{step.detail}</p>
        </article>)}
      </section>

      <section className="mt-9" aria-labelledby="concursos-title">
        <div className="flex items-end justify-between gap-4"><div><p className="font-mono text-[11px] font-black tracking-[.3em] text-cyan-300">UNIDADES DISPONÍVEIS</p><h2 id="concursos-title" className="mt-1 text-2xl font-black text-white sm:text-3xl">Escolha sua tropa</h2></div><span className="hidden rounded-full border border-cyan-200/20 px-3 py-1 text-xs font-bold text-cyan-100 sm:block">Ranking ativo</span></div>
        {contests.length ? <div className="mt-5 grid gap-4 lg:grid-cols-2">{contests.map((contest) => { const leader = contest.ranking[0]; return <article key={contest.contest.slug} className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_13rem]">
          <Link href={`/recordes/${encodeURIComponent(contest.contest.slug)}`} className="group relative flex min-h-44 items-center gap-5 overflow-hidden rounded-[1.75rem] border border-cyan-300/35 bg-[#071a34] p-5 shadow-[0_0_48px_rgba(6,182,212,.11)] transition hover:-translate-y-0.5 hover:border-cyan-200/75 hover:shadow-[0_0_56px_rgba(34,211,238,.22)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-300 sm:p-6">
            <div aria-hidden="true" className="absolute inset-y-0 right-0 w-1/2 bg-gradient-to-l from-cyan-400/[.08] to-transparent" />
            <RecordsContestImage src={contest.contest.imageUrl} alt={`Imagem ${contest.contest.shortName}`} className="relative h-20 w-20 shrink-0 rounded-2xl border border-cyan-200/30 object-cover object-right sm:h-24 sm:w-24" />
            <span className="relative min-w-0 flex-1"><span className="inline-flex rounded-full border border-amber-300/30 bg-amber-300/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-amber-200">Elite</span><span className="mt-3 block text-3xl font-black tracking-tight text-white">{contest.contest.shortName}</span><span className="mt-1 block max-h-11 overflow-hidden text-sm leading-relaxed text-slate-300">{contest.contest.description || contest.contest.name}</span><span className="mt-4 inline-flex items-center text-sm font-black text-cyan-300 underline underline-offset-4">Ver ranking <span aria-hidden="true" className="ml-1 transition group-hover:translate-x-1">→</span></span></span>
          </Link>
          <aside className="relative overflow-hidden rounded-[1.75rem] border border-amber-300/25 bg-[#111827] p-5 shadow-[0_0_42px_rgba(251,191,36,.07)]"><p className="font-mono text-[10px] font-black tracking-[.25em] text-amber-200">LÍDER · {contest.contest.shortName}</p>{leader ? <><p className="mt-4 truncate text-xl font-black text-white">{leader.publicName}</p><p className="mt-1 font-mono text-3xl font-black text-cyan-300">{leader.score.toLocaleString("pt-BR")}</p><Link href={`/recordes/${encodeURIComponent(contest.contest.slug)}`} className="mt-4 inline-flex text-sm font-bold text-cyan-200 underline underline-offset-4">Ver ranking completo →</Link></> : <p className="mt-4 text-sm text-slate-400">Ainda não há participantes neste ranking.</p>}</aside>
        </article>})}</div> : <p className="mt-5 rounded-2xl border border-cyan-200/15 bg-[#071329] p-5 text-slate-300">Ainda não há concursos disponíveis em Records.</p>}
      </section>
    </div>
  </main>;
}
