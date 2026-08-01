export default function RankingLegisLoading() {
  return (
    <div className="min-h-screen overflow-hidden bg-[#020817] text-white">
      <div className="relative mx-auto flex max-w-6xl flex-col gap-7 px-4 py-8 sm:px-6 lg:py-12">
        <section className="text-center">
          <div className="mx-auto h-36 w-36 animate-pulse rounded-lg bg-blue-950/45 sm:h-44 sm:w-44" />
          <div className="mx-auto mt-5 h-12 w-64 animate-pulse rounded bg-blue-900/45 sm:h-16 sm:w-80" />
          <p className="mt-4 text-base font-black text-blue-100">
            Carregando Liga das Leis...
          </p>
        </section>

        <section className="grid gap-5 lg:grid-cols-2">
          <div className="h-64 rounded-lg border border-blue-400/20 bg-slate-950/70" />
          <div className="h-64 rounded-lg border border-blue-400/20 bg-slate-950/70" />
        </section>

        <section className="h-[620px] rounded-lg border border-blue-400/20 bg-slate-950/70" />
      </div>
    </div>
  );
}
