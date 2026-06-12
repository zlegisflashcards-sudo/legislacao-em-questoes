export default function ObrigadoPage() {
  return (
    <div className="bg-[#171a21]">
      <div className="mx-auto flex max-w-4xl flex-col gap-8 px-5 py-12 sm:px-6 sm:py-16">
        <section className="space-y-4 text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-300">
            Legis Flashcards
          </p>
          <h1 className="text-4xl font-black leading-tight text-white sm:text-5xl">
            Pagamento confirmado ✅
          </h1>
        </section>

        <section className="grid gap-5">
          <article className="rounded-lg border border-blue-200/30 bg-white p-6 shadow-[0_18px_45px_rgba(0,0,0,0.28)]">
            <h2 className="text-xl font-bold text-[#062a5f]">
              Como acessar suas leis adquiridas
            </h2>
            <ol className="mt-4 space-y-3 text-sm leading-6 text-slate-700">
              <li>
                1. Clique em “🔐 Minhas leis adquiridas” no cabeçalho do site.
              </li>
              <li>
                2. Faça login na Hotmart com o mesmo e-mail utilizado na compra.
              </li>
              <li>
                3. Acesse o material adquirido e comece seus estudos.
              </li>
            </ol>
          </article>

          <article className="rounded-lg border border-blue-200/30 bg-white p-6 shadow-[0_18px_45px_rgba(0,0,0,0.28)]">
            <h2 className="text-xl font-bold text-[#062a5f]">
              Você também ganhou pontos 🎉
            </h2>
            <p className="mt-4 text-sm leading-6 text-slate-700">
              Sua compra gera pontos no programa de fidelidade Legis
              Flashcards. Esses pontos ajudam você a subir de nível e liberar
              cupons de desconto para novas leis.
            </p>
          </article>

          <article className="rounded-lg border border-blue-200/30 bg-white p-6 shadow-[0_18px_45px_rgba(0,0,0,0.28)]">
            <h2 className="text-xl font-bold text-[#062a5f]">
              Ainda com dúvidas?
            </h2>
            <p className="mt-4 text-sm leading-6 text-slate-700">
              Se não encontrar seu acesso, verifique se está utilizando o mesmo
              e-mail da compra na Hotmart. Caso o problema continue, utilize o
              botão WhatsApp disponível no cabeçalho.
            </p>
          </article>
        </section>
      </div>
    </div>
  );
}
