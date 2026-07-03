export default function RankingLegisLoading() {
  return (
    <div className="min-h-screen overflow-hidden bg-[#020817] text-white">
      <div className="relative mx-auto flex max-w-6xl flex-col gap-8 px-5 py-10 sm:px-6 lg:py-14">
        <section className="grid items-center gap-10 lg:grid-cols-[0.92fr_1.08fr]">
          <div className="space-y-6 text-center lg:text-left">
            <div className="mx-auto h-9 w-56 animate-pulse rounded-full bg-blue-900/60 lg:mx-0" />
            <div className="space-y-3">
              <div className="mx-auto h-16 w-full max-w-xl animate-pulse rounded bg-blue-900/45 lg:mx-0" />
              <div className="mx-auto h-6 w-full max-w-lg animate-pulse rounded bg-blue-900/35 lg:mx-0" />
            </div>
            <p className="text-base font-black text-blue-100">
              Carregando ranking...
            </p>
          </div>

          <div className="h-[360px] animate-pulse rounded-lg bg-blue-950/35" />
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.4fr_0.8fr]">
          <div className="h-[620px] rounded-lg border border-blue-400/20 bg-slate-950/68" />
          <div className="space-y-5">
            <div className="h-64 rounded-lg border border-blue-400/20 bg-slate-950/68" />
            <div className="h-72 rounded-lg border border-blue-400/20 bg-slate-950/68" />
          </div>
        </section>
      </div>
    </div>
  );
}
