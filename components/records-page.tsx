import Link from "next/link";
import { RecordsContestImage } from "@/components/records-contest-image";
import type { RecordsContest } from "@/lib/records-ranking-server";

export function RecordsPage({ contests }: { contests: RecordsContest[] }) {
  const groups = [
    { key: "edital", eyebrow: "GALERIAS", title: null, items: contests.filter((contest) => contest.productType === "edital") },
    { key: "lei_avulsa", eyebrow: "LEIS DISPONÍVEIS", title: "Leis", items: contests.filter((contest) => contest.productType === "lei_avulsa") },
    { key: "other", eyebrow: "OUTROS RECORDS", title: "Outros", items: contests.filter((contest) => contest.productType !== "edital" && contest.productType !== "lei_avulsa") },
  ];
  return <main className="min-h-screen overflow-hidden bg-[#020817] px-4 py-6 text-slate-100 sm:px-6 sm:py-10 lg:py-16">
    <div className="mx-auto max-w-6xl">
      <header className="relative isolate overflow-hidden rounded-[2rem] border border-cyan-300/25 bg-[#06152c] px-6 py-9 shadow-[0_0_80px_rgba(14,165,233,.13)] sm:px-10 sm:py-14">
        <div aria-hidden="true" className="absolute inset-0 -z-20 opacity-70 [background-image:linear-gradient(rgba(56,189,248,.07)_1px,transparent_1px),linear-gradient(90deg,rgba(56,189,248,.07)_1px,transparent_1px)] [background-size:28px_28px]" />
        <div aria-hidden="true" className="absolute -right-24 top-0 -z-10 h-64 w-64 rounded-full bg-cyan-400/15 blur-3xl" />
        <div aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200 to-transparent" />
        <p className="font-mono text-[11px] font-black tracking-[.32em] text-cyan-300">LEGIS QUESTÕES</p>
        <h1 className="mt-3 text-5xl font-black tracking-[.04em] text-white sm:text-7xl">RECORDS</h1>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-slate-200 sm:text-lg">Acompanhe os melhores desempenhos da comunidade Legis Flashcards. Escolha um concurso e veja quem está se destacando.</p>
      </header>

      <section className="mt-6 rounded-2xl border border-cyan-200/15 bg-[#071329] px-5 py-4 shadow-[0_0_30px_rgba(6,182,212,.06)] sm:px-6" aria-labelledby="pontuacao-title">
        <div className="flex gap-3">
          <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-300/30 bg-cyan-300/10 font-black text-cyan-200">↑</span>
          <div>
            <h2 id="pontuacao-title" className="font-black text-white">Como pontuar</h2>
            <p className="mt-1 text-sm leading-relaxed text-slate-300">Resolva questões competitivas das leis do concurso para somar pontos e subir no ranking.</p>
          </div>
        </div>
      </section>

      {contests.length ? <div className="mt-9 space-y-10">{groups.filter((group) => group.items.length).map((group) => <section key={group.key} aria-labelledby={group.title ? `records-${group.key}` : undefined} aria-label={group.title ? undefined : group.eyebrow}>
        <div><p className="font-mono text-[11px] font-black tracking-[.3em] text-cyan-300">{group.eyebrow}</p>{group.title ? <h2 id={`records-${group.key}`} className="mt-1 text-2xl font-black text-white sm:text-3xl">{group.title}</h2> : null}</div>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{group.items.map((contest) => <Link key={contest.productSlug} href={contest.rankingHref} className="group relative flex min-h-52 items-center gap-5 overflow-hidden rounded-[1.75rem] border border-cyan-300/35 bg-[#071a34] p-5 shadow-[0_0_48px_rgba(6,182,212,.11)] transition hover:-translate-y-0.5 hover:border-cyan-200/75 hover:shadow-[0_0_56px_rgba(34,211,238,.22)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-300 sm:p-6 max-[360px]:flex-col max-[360px]:items-start">
          <div aria-hidden="true" className="absolute inset-y-0 right-0 w-3/4 bg-gradient-to-l from-cyan-400/[.08] to-transparent" />
          <RecordsContestImage src={contest.contestImageUrl} alt={`Imagem ${contest.shortName}`} className="relative h-20 w-20 shrink-0 rounded-2xl border border-cyan-200/30 object-cover object-right shadow-[0_0_28px_rgba(34,211,238,.15)] sm:h-24 sm:w-24" />
          <span className="relative flex min-w-0 flex-1 self-stretch flex-col py-1"><span className="inline-flex w-fit rounded-full border border-amber-300/30 bg-amber-300/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-amber-200">Grupo de elite</span>
            <span className="mt-2 text-3xl font-black tracking-tight text-white">{contest.shortName}</span>
            <span className="mt-1 line-clamp-2 text-sm leading-relaxed text-slate-300">{contest.name}</span>
            <span className="mt-auto pt-3 text-sm font-black text-cyan-300 underline underline-offset-4">Ver ranking <span aria-hidden="true" className="ml-1 inline-block transition group-hover:translate-x-1">→</span></span>
          </span>
        </Link>)}</div>
      </section>)}</div> : <p className="mt-9 rounded-2xl border border-cyan-200/15 bg-[#071329] p-5 text-slate-300">Ainda não há produtos disponíveis em Records.</p>}
    </div>
  </main>;
}
