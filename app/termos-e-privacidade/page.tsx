export default function TermosEPrivacidadePage() {
  return (
    <div className="bg-[#070b12] px-5 py-10 text-slate-100 sm:px-6">
      <main className="mx-auto max-w-3xl rounded-[22px] border border-blue-300/20 bg-white p-6 text-slate-800 shadow-[0_18px_44px_rgba(0,0,0,0.22)] sm:p-8">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-blue-700">
          LegisFlashcards
        </p>
        <h1 className="mt-3 text-3xl font-black text-[#062a5f]">
          Termos e Privacidade
        </h1>
        <p className="mt-4 leading-7 text-slate-600">
          Esta página reúne as informações institucionais de termos de uso e
          privacidade do projeto. Em caso de dúvidas sobre acesso, compra,
          comunidade ou tratamento de dados, fale com a equipe da
          LegisFlashcards.
        </p>

        <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50 p-5">
          <h2 className="text-lg font-black text-[#062a5f]">Contato</h2>
          <p className="mt-2 leading-7 text-slate-700">
            E-mail:{" "}
            <a
              href="mailto:zlegisflashcards@gmail.com"
              className="font-bold text-blue-700 hover:underline"
            >
              zlegisflashcards@gmail.com
            </a>
          </p>
        </div>

        <a
          href="/"
          className="mt-7 inline-flex rounded-xl bg-blue-700 px-5 py-3 font-black text-white transition hover:bg-blue-600"
        >
          Voltar para a página inicial
        </a>
      </main>
    </div>
  );
}
