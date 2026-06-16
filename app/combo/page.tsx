import {
  filtrarLegislacoesDoCombo,
  getLegislacoes,
} from "@/lib/legislacoes";

const comboCheckoutUrl =
  "https://pay.hotmart.com/B105667368Q?sck=HOTMART_MEM_CA&off=8z92z2aa&bid=1781643392565";

function formatarQuantidadeFlashcards(quantidade: number) {
  return quantidade.toLocaleString("pt-BR");
}

export default async function ComboPage() {
  const legislacoes = await getLegislacoes();
  const legislacoesDoCombo = filtrarLegislacoesDoCombo(legislacoes);

  return (
    <div className="bg-[#171a21] text-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-5 py-10 sm:px-6 sm:py-14">
        <a
          href="/"
          className="w-fit text-sm font-semibold text-slate-300 hover:text-blue-300"
        >
          ← Voltar para a Home
        </a>

        <section className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div className="space-y-6">
            <p className="text-sm font-bold uppercase tracking-wide text-blue-300">
              Legis Flashcards
            </p>
            <div className="space-y-4">
              <h1 className="text-4xl font-black leading-tight sm:text-5xl">
                Combo de Leis em Flashcards
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-slate-200">
                Acesse várias legislações em flashcards no Anki, com lista
                constantemente atualizada.
              </p>
            </div>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <a
                href={comboCheckoutUrl}
                className="inline-flex items-center justify-center rounded-lg bg-gradient-to-r from-[#062a5f] to-blue-600 px-8 py-5 text-base font-black text-white shadow-[0_18px_40px_rgba(37,99,235,0.42)] ring-1 ring-white/20 transition hover:scale-[1.02] hover:from-[#041d42] hover:to-blue-500 hover:shadow-[0_22px_50px_rgba(37,99,235,0.52)] sm:text-lg"
              >
                Garantir acesso ao Combo
              </a>
              <p className="text-sm font-semibold text-blue-100">
                Pagamento seguro via Hotmart
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-blue-200/30 bg-white p-6 text-slate-950 shadow-[0_24px_70px_rgba(0,0,0,0.38)]">
            <p className="text-sm font-bold uppercase tracking-wide text-slate-500">
              Oferta do Combo
            </p>
            <p className="mt-3 text-4xl font-black text-[#062a5f] sm:text-5xl">
              12x de R$ 39,00
            </p>
            <p className="mt-4 text-sm leading-6 text-slate-600">
              Uma biblioteca de legislações em flashcards para revisar com
              velocidade, organização e atualização contínua.
            </p>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-3">
          {[
            "Flashcards prontos para estudar no Anki",
            "Várias legislações reunidas em um só acesso",
            "Lista atualizada conforme novos materiais entram no Combo",
          ].map((beneficio) => (
            <div
              key={beneficio}
              className="rounded-lg border border-slate-700 bg-slate-900/70 p-5 shadow-[0_16px_40px_rgba(0,0,0,0.22)]"
            >
              <p className="text-base font-bold leading-7 text-white">
                {beneficio}
              </p>
            </div>
          ))}
        </section>

        <section id="leis-incluidas" className="space-y-5">
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-blue-300">
              Leis incluídas
            </p>
          </div>

          {legislacoesDoCombo.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {legislacoesDoCombo.map((legislacao) => (
                <article
                  key={legislacao.slug}
                  className="flex items-center justify-between gap-4 rounded-lg border border-slate-700 bg-white p-5 text-slate-950 shadow-[0_16px_40px_rgba(0,0,0,0.22)]"
                >
                  <h3 className="text-base font-black leading-6">
                    {legislacao.nome}
                  </h3>
                  <p className="shrink-0 rounded bg-blue-50 px-3 py-2 text-sm font-bold text-[#062a5f]">
                    {formatarQuantidadeFlashcards(
                      legislacao.quantidadeFlashcards,
                    )}{" "}
                    flashcards
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-6 text-slate-200">
              Nenhuma lei foi marcada para o Combo ainda.
            </div>
          )}
        </section>

        <section className="flex flex-col items-center gap-4 rounded-lg border border-blue-200/30 bg-[#062a5f] p-6 text-center shadow-[0_22px_55px_rgba(0,0,0,0.32)]">
          <p className="text-xl font-black text-white">
            Comece pelo Combo e estude várias leis em uma única biblioteca.
          </p>
          <a
            href={comboCheckoutUrl}
            className="inline-flex items-center justify-center rounded-lg bg-white px-8 py-5 text-base font-black text-[#062a5f] shadow-[0_18px_40px_rgba(0,0,0,0.25)] transition hover:scale-[1.02] hover:bg-blue-50 sm:text-lg"
          >
            Comprar Combo — 12x de R$ 39,00
          </a>
        </section>
      </div>
    </div>
  );
}
