import { LegisBotCommentsList } from "@/components/legisbot-comments-list";
import AdminPublicShortcut from "@/components/admin/admin-public-shortcut";
import type { ComentarioPublicoLegisBot } from "@/lib/legisbot/comentarios-publicos";

type LegisBotCommentsIndexProps = {
  comentarios: ComentarioPublicoLegisBot[];
  hotmartUrl?: string;
  adminSlug: string;
};

export function LegisBotCommentsIndex({
  comentarios,
  hotmartUrl,
  adminSlug,
}: LegisBotCommentsIndexProps) {
  const linkAquisicao = hotmartUrl?.trim();

  return (
    <section
      className="min-w-0 rounded-2xl border border-blue-100 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] sm:p-8"
      aria-labelledby="legisbot-comments-title"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span
            className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-blue-100 text-2xl shadow-sm"
            aria-hidden="true"
          >
            🤖
          </span>
          <h2
            id="legisbot-comments-title"
            className="text-2xl font-black leading-tight text-[#062a5f] sm:text-3xl"
          >
            Legislação comentada
          </h2>
        </div>
        <AdminPublicShortcut variant="manage" slug={adminSlug} />
      </div>

      <p className="mt-5 max-w-3xl leading-7 text-slate-600">
        Acesse pela Central de Estudos da Legislação os comentários e explicações do
        LegisBot, organizados artigo por artigo, e participe da comunidade,
        compartilhando dúvidas, observações e interpretações com outros estudantes.
      </p>

      <LegisBotCommentsList comentarios={comentarios} />

      <aside className="mt-8 rounded-xl border border-blue-100 bg-blue-50/70 p-5 sm:p-6">
        <h3 className="text-lg font-black text-[#062a5f]">
          Desbloqueie novos artigos comentados
        </h3>
        <div className="mt-3 max-w-3xl space-y-2 leading-7 text-slate-600">
          <p>
            Você pode consultar gratuitamente todos os comentários já disponíveis nesta página.
          </p>
          <p>
            Para gerar a explicação de um novo artigo, acesse o botão do LegisBot dentro dos
            flashcards desta legislação. A nova explicação ficará disponível também na Central
            de Estudos.
          </p>
        </div>
        {linkAquisicao ? (
          <a
            href={linkAquisicao}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-blue-700 px-5 py-3 text-center text-sm font-black text-white shadow-sm transition hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 sm:w-auto"
          >
            Adquirir Flashcards
          </a>
        ) : null}
      </aside>
    </section>
  );
}
