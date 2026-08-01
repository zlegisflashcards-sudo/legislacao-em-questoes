import type { Metadata } from "next";
import type { ReactNode } from "react";
import {
  getRankingLegisData,
  parseRankingDateValue,
  type RankingLegisData,
} from "@/lib/ranking-sheets";
import { RankingLegisTable } from "@/components/ranking-legis-table";

export const metadata: Metadata = {
  title: "Liga das Leis | LegisFlashcards",
  description:
    "Classificacao oficial da Liga das Leis da comunidade LegisFlashcards.",
};

function formatarNumero(numero: number) {
  return new Intl.NumberFormat("pt-BR").format(numero);
}

function formatarDataAtualizacao(value: string) {
  const timestamp = parseRankingDateValue(value);

  if (!timestamp) {
    return "";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(timestamp));
}

function formatarInstagram(instagram: string) {
  const trimmedInstagram = instagram.trim();

  if (!trimmedInstagram) {
    return "";
  }

  return trimmedInstagram.startsWith("@")
    ? trimmedInstagram
    : `@${trimmedInstagram}`;
}

function RankingShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen overflow-hidden bg-[#020817] text-white">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-0 h-[420px] w-[820px] -translate-x-1/2 rounded-full bg-blue-600/18 blur-[120px]" />
        <div className="absolute right-[-140px] top-[260px] h-[360px] w-[360px] rounded-full bg-blue-500/10 blur-[90px]" />
      </div>

      <div className="relative mx-auto flex max-w-6xl flex-col gap-7 px-4 py-8 sm:px-6 lg:py-12">
        {children}
      </div>
    </div>
  );
}

function RankingUnavailable() {
  return (
    <RankingShell>
      <section className="rounded-lg border border-blue-400/25 bg-slate-950/70 p-8 text-center shadow-[0_24px_80px_rgba(0,0,0,0.36)] backdrop-blur">
        <h1 className="text-3xl font-black text-white sm:text-5xl">
          Liga das Leis
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-slate-300">
          Liga das Leis temporariamente indispon&iacute;vel. Tente novamente
          em breve.
        </p>
      </section>
    </RankingShell>
  );
}

function ThemeCover({
  imagemUrl,
  temaAtual,
}: {
  imagemUrl: string;
  temaAtual: string;
}) {
  if (imagemUrl) {
    return (
      <img
        src={imagemUrl}
        alt={`Capa do curso ${temaAtual}`}
        className="h-32 w-24 shrink-0 rounded-md border border-blue-200/20 object-cover shadow-[0_18px_32px_rgba(0,0,0,0.38)]"
      />
    );
  }

  return (
    <div className="relative h-32 w-24 shrink-0 overflow-hidden rounded-md border border-blue-200/20 bg-[linear-gradient(160deg,#063b88,#0f172a_58%,#020817)] shadow-[0_18px_32px_rgba(0,0,0,0.38)]">
      <div className="absolute left-3 right-3 top-4 h-2 rounded-full bg-blue-300/50" />
      <div className="absolute inset-x-3 top-11 text-center text-[10px] font-black uppercase leading-4 text-white">
        {temaAtual}
      </div>
      <div className="absolute bottom-4 left-3 right-3 rounded bg-yellow-400 px-2 py-2 text-center text-[10px] font-black uppercase leading-3 text-slate-950">
        Flashcards
      </div>
    </div>
  );
}

function TemaCard({ tema }: { tema: RankingLegisData["tema"] }) {
  return (
    <article className="rounded-lg border border-blue-400/25 bg-slate-950/70 p-5 shadow-[0_20px_70px_rgba(0,0,0,0.28)] backdrop-blur">
      <h2 className="mb-5 text-xl font-black text-white">
        Tema da Liga
      </h2>

      <div className="flex gap-5">
        <ThemeCover imagemUrl={tema.imagemUrl} temaAtual={tema.temaAtual} />

        <div className="min-w-0 space-y-3">
          <h3 className="text-xl font-black leading-tight text-white">
            {tema.temaAtual}
          </h3>
          <p className="text-sm leading-6 text-slate-300">{tema.descricao}</p>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <a
          href={tema.cursoUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-5 py-3 text-center text-sm font-black text-white shadow-[0_14px_30px_rgba(37,99,235,0.32)] transition hover:-translate-y-0.5 hover:bg-blue-500"
        >
          Comprar curso do tema
        </a>

        {tema.instagramUrl ? (
          <a
            href={tema.instagramUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center rounded-lg border border-blue-300/20 bg-blue-950/40 px-5 py-3 text-center text-sm font-black text-slate-100 transition hover:border-blue-300/40 hover:bg-blue-900/50"
          >
            Responder no Instagram
          </a>
        ) : null}
      </div>
    </article>
  );
}

function DestaqueCard({
  destaque,
}: {
  destaque: RankingLegisData["destaqueMaisCurtido"];
}) {
  if (!destaque) {
    return null;
  }

  return (
    <article className="rounded-lg border border-blue-400/25 bg-slate-950/70 p-5 shadow-[0_20px_70px_rgba(0,0,0,0.28)] backdrop-blur">
      <h2 className="mb-5 text-xl font-black text-white">
        Coment&aacute;rio destaque
      </h2>

      <div className="rounded-lg border border-blue-300/10 bg-blue-950/28 p-5">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-200">
          Mais curtido pela comunidade
        </p>
        {destaque.nome ? (
          <h3 className="mt-4 text-2xl font-black leading-tight text-white">
            {destaque.nome}
          </h3>
        ) : null}
        <p className="mt-2 text-base font-bold text-slate-300">
          {formatarInstagram(destaque.instagram)}
        </p>
        <p className="mt-5 inline-flex rounded-full bg-yellow-400/15 px-4 py-2 text-sm font-black text-yellow-200">
          {formatarNumero(destaque.curtidas)} curtidas
        </p>
      </div>
    </article>
  );
}

function Classificacao({ ranking }: { ranking: RankingLegisData["ranking"] }) {
  return (
    <section
      id="ranking-legis-classificacao"
      className="overflow-hidden rounded-lg border border-blue-400/25 bg-slate-950/70 shadow-[0_24px_80px_rgba(0,0,0,0.36)] backdrop-blur"
    >
      <div className="border-b border-blue-300/10 bg-blue-950/30 px-5 py-5">
        <h2 className="text-2xl font-black text-white">
          Classifica&ccedil;&atilde;o
        </h2>
      </div>
      <RankingLegisTable ranking={ranking} />
    </section>
  );
}

function RankingContent({ data }: { data: RankingLegisData }) {
  const dataAtualizacao = formatarDataAtualizacao(data.atualizadoEm);

  return (
    <>
      <section className="text-center">
        <img
          src="/ranking-legis-trophy.png"
          alt="Taca dourada da Liga das Leis"
          className="mx-auto h-auto w-36 object-contain drop-shadow-[0_24px_52px_rgba(245,158,11,0.28)] sm:w-44"
        />
        <h1 className="mt-5 text-4xl font-black leading-none text-white sm:text-6xl">
          Liga das Leis
        </h1>
        {dataAtualizacao ? (
          <p className="mt-3 text-sm font-bold text-slate-300">
            Atualizado em {dataAtualizacao}
          </p>
        ) : null}
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <TemaCard tema={data.tema} />
        <DestaqueCard destaque={data.destaqueMaisCurtido} />
      </section>

      <Classificacao ranking={data.ranking} />
    </>
  );
}

export default async function RankingLegisPage() {
  try {
    const data = await getRankingLegisData();

    return (
      <RankingShell>
        <RankingContent data={data} />
      </RankingShell>
    );
  } catch {
    return <RankingUnavailable />;
  }
}
