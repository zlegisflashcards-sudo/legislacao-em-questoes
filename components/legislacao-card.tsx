import type { Legislacao } from "@/lib/legislacoes";

export function LegislacaoCard({ legislacao }: { legislacao: Legislacao }) {
  const isConstituicaoFederal =
    legislacao.categoria === "Constituição Federal";

  return (
    <article className="flex h-full min-h-[320px] flex-col overflow-hidden rounded-[22px] border border-[#1683ff] bg-white shadow-[0_14px_34px_rgba(15,111,255,0.12)] transition duration-200 hover:-translate-y-1 hover:shadow-[0_18px_42px_rgba(15,111,255,0.2)]">
      <div className="flex min-h-[64px] items-center justify-between gap-3 bg-gradient-to-r from-[#123c74] to-[#07172d] px-5 py-3 text-white">
        <div className="flex min-w-0 items-center gap-3">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#1683ff] bg-[#062a5f] text-base text-[#28b7ff] shadow-[0_0_14px_rgba(40,183,255,0.28)]">
            ⚡︎
          </span>
          <span className="truncate text-sm font-bold">Legislação em Questões</span>
        </div>
        <span className="shrink-0 text-xs font-bold text-slate-300">4.0</span>
      </div>

      <div className="flex flex-1 flex-col justify-between p-6">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            {isConstituicaoFederal && (
              <img
                src="/bandeira-brasil.svg"
                alt="Bandeira do Brasil"
                className="h-7 w-10 shrink-0 rounded-sm object-cover shadow-sm"
              />
            )}
            <h3 className="text-xl font-extrabold leading-snug text-[#0868ed] sm:text-2xl">
              {legislacao.nome}
            </h3>
          </div>
          <p className="text-sm leading-6 text-slate-600">
            {legislacao.descricaoCurta}
          </p>
        </div>

        {isConstituicaoFederal ? (
          <a
            href="/constituicao-federal-gratis"
            className="mt-7 inline-flex min-h-14 w-full items-center justify-center rounded-2xl bg-green-500 px-5 text-center text-sm font-extrabold text-white shadow-[0_12px_26px_rgba(34,197,94,0.3)] transition hover:-translate-y-0.5 hover:bg-green-400 hover:shadow-[0_16px_32px_rgba(34,197,94,0.4)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-500"
          >
            Acessar gratuitamente
          </a>
        ) : (
          <div className="mt-7 grid grid-cols-2 gap-3">
            <span className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-[#0877ff] px-3 text-center text-sm font-bold text-[#0868ed]">
              {legislacao.quantidadeFlashcards} {legislacao.unidade}
            </span>
            <a
              href={`/leisflashcards/${legislacao.slug}`}
              className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-[#0877ff] px-3 text-center text-sm font-bold text-[#0868ed] transition hover:bg-[#0868ed] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0868ed]"
            >
              Saiba mais
            </a>
          </div>
        )}
      </div>
    </article>
  );
}
