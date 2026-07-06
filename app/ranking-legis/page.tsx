import type { Metadata } from "next";
import type { ReactNode } from "react";
import {
  getRankingLegisData,
  type RankingLegisData,
} from "@/lib/ranking-sheets";
import { siteConfig } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "Ranking Legis | LegisFlashcards",
  description:
    "Ranking competitivo da comunidade LegisFlashcards para quem responde as questões do Instagram.",
};

const todosParticipantesUrl = "#ranking-completo";
const regrasPontuacao = [
  ["1º comentário correto", "10 pontos"],
  ["2º comentário correto", "9 pontos"],
  ["3º comentário correto", "8 pontos"],
  ["4º comentário correto", "7 pontos"],
  ["5º comentário correto", "6 pontos"],
  ["6º comentário correto", "5 pontos"],
  ["7º comentário correto", "4 pontos"],
  ["8º comentário correto", "3 pontos"],
  ["9º comentário correto", "2 pontos"],
  ["10º comentário correto", "1 ponto"],
];

const premiacaoOficial = [
  ["1º lugar", "100% OFF"],
  ["2º lugar", "90% OFF"],
  ["3º lugar", "80% OFF"],
  ["4º lugar", "70% OFF"],
  ["5º lugar", "60% OFF"],
  ["6º lugar", "50% OFF"],
  ["7º lugar", "40% OFF"],
  ["8º lugar", "30% OFF"],
  ["9º lugar", "20% OFF"],
  ["10º lugar", "10% OFF"],
];

const regrasPremiacao = [
  "Os vencedores têm 24h para solicitar o cupom e comprar com o desconto do prêmio.",
];

function formatarPontos(pontos: number) {
  return new Intl.NumberFormat("pt-BR").format(pontos);
}

function medalhaClasse(posicao: number) {
  if (posicao === 1) {
    return "bg-[linear-gradient(145deg,#fff3a7,#f2b21b_55%,#a86707)] text-slate-950 shadow-[0_0_22px_rgba(245,180,38,0.38)]";
  }

  if (posicao === 2) {
    return "bg-[linear-gradient(145deg,#ffffff,#b8c2ce_55%,#6b7582)] text-slate-950 shadow-[0_0_18px_rgba(203,213,225,0.26)]";
  }

  if (posicao === 3) {
    return "bg-[linear-gradient(145deg,#ffd0a1,#d97917_55%,#7c2d12)] text-slate-950 shadow-[0_0_18px_rgba(249,115,22,0.28)]";
  }

  return "border border-blue-300/15 bg-blue-950/40 text-slate-200";
}

function RankingUnavailable() {
  return (
    <RankingShell>
      <section className="rounded-lg border border-blue-400/25 bg-slate-950/68 p-8 text-center shadow-[0_24px_80px_rgba(0,0,0,0.36)] backdrop-blur">
        <h1 className="text-3xl font-black text-white sm:text-5xl">
          Ranking LegisFlashcards
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-slate-300">
          Ranking temporariamente indisponível. Tente novamente em breve.
        </p>
      </section>
    </RankingShell>
  );
}

function RankingShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen overflow-hidden bg-[#020817] text-white">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-0 h-[520px] w-[920px] -translate-x-1/2 rounded-full bg-blue-600/20 blur-[120px]" />
        <div className="absolute right-[-120px] top-[220px] h-[360px] w-[360px] rounded-full bg-blue-500/10 blur-[90px]" />
      </div>

      <div className="relative mx-auto flex max-w-6xl flex-col gap-10 px-5 py-10 sm:px-6 lg:py-14">
        {children}
      </div>
    </div>
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
        className="h-36 w-24 shrink-0 rounded-md border border-blue-200/20 object-cover shadow-[0_20px_34px_rgba(0,0,0,0.4)]"
      />
    );
  }

  return (
    <div className="relative h-36 w-24 shrink-0 overflow-hidden rounded-md border border-blue-200/20 bg-[linear-gradient(160deg,#063b88,#0f172a_58%,#020817)] shadow-[0_20px_34px_rgba(0,0,0,0.4)]">
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

function ParticipantAvatar({ posicao }: { posicao: number }) {
  const ringClass =
    posicao === 1
      ? "ring-yellow-300/70"
      : posicao === 2
        ? "ring-slate-200/60"
        : posicao === 3
          ? "ring-orange-300/60"
          : "ring-blue-200/20";

  return (
    <span
      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[radial-gradient(circle_at_35%_24%,#60a5fa,#1d4ed8_46%,#082f49)] shadow-[0_0_18px_rgba(37,99,235,0.34)] ring-2 ${ringClass}`}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 40 40"
        className="h-10 w-10"
        role="img"
        aria-label="Avatar de participante"
      >
        <circle cx="20" cy="15" r="7" fill="#dbeafe" />
        <path
          d="M8 35c1.6-8 6.2-12 12-12s10.4 4 12 12"
          fill="#bfdbfe"
        />
        <path
          d="M13 15c1.2-5.2 4.4-7.8 8.9-7.2 3.8.5 6.1 3.3 6.3 7.2-2.5-1.4-5.1-2.3-8.1-2.3-2.7 0-5 .8-7.1 2.3Z"
          fill="#0f172a"
          opacity="0.55"
        />
      </svg>
    </span>
  );
}

function RankingContent({ data }: { data: RankingLegisData }) {
  const { ranking, tema, rodada, atualizadoEm } = data;

  return (
    <>
      <section className="grid items-center gap-10 lg:grid-cols-[0.92fr_1.08fr]">
        <div className="space-y-7 text-center lg:text-left">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-300/25 bg-blue-950/60 px-4 py-2 text-xs font-black uppercase tracking-[0.22em] text-blue-200 shadow-[0_12px_40px_rgba(37,99,235,0.18)]">
            Liga oficial Legis
          </div>

          <div className="space-y-5">
            <h1 className="text-4xl font-black leading-[0.98] tracking-normal text-white drop-shadow-[0_16px_38px_rgba(0,0,0,0.48)] sm:text-6xl lg:text-7xl">
              Ranking
              <br />
              <span className="text-blue-500">Legis</span>
              <wbr />
              Flashcards
            </h1>
            <p className="mx-auto max-w-xl text-lg leading-8 text-slate-300 sm:text-xl lg:mx-0">
              Estude, responda no Instagram e suba no ranking de pontos.
            </p>
          </div>

          <a
            href={tema.instagramUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex w-full items-center justify-center rounded-lg bg-blue-600 px-6 py-4 text-base font-black text-white shadow-[0_18px_36px_rgba(37,99,235,0.38)] transition hover:-translate-y-0.5 hover:bg-blue-500 sm:w-auto"
          >
            Responder no Instagram
          </a>
        </div>

        <div className="relative min-h-[360px]">
          <div className="absolute inset-x-10 bottom-8 h-20 rounded-full bg-blue-500/20 blur-3xl" />
          <div className="absolute left-1/2 top-8 h-[310px] w-[310px] -translate-x-1/2 rounded-full border border-blue-300/10 bg-blue-500/10 blur-2xl" />
          <img
            src="/ranking-legis-trophy.png"
            alt="Taça dourada do Ranking LegisFlashcards"
            className="relative z-10 mx-auto h-auto w-full max-w-[560px] object-contain drop-shadow-[0_36px_70px_rgba(0,0,0,0.55)]"
          />
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.4fr_0.8fr]">
        <article
          id="ranking-completo"
          className="overflow-hidden rounded-lg border border-blue-400/25 bg-slate-950/68 shadow-[0_24px_80px_rgba(0,0,0,0.36)] backdrop-blur"
        >
          <div className="flex flex-col gap-3 border-b border-blue-300/10 bg-blue-950/36 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="flex items-center gap-3 text-xl font-black">
              <span className="text-2xl">🏆</span>
              Ranking atualizado
            </h2>
            <p className="text-sm font-medium text-slate-300">
              {atualizadoEm ? `Atualizado em ${atualizadoEm}` : "Atualização em breve"}
            </p>
          </div>

          <div className="overflow-x-auto px-5 py-4">
            {ranking.length > 0 ? (
              <table className="w-full min-w-[760px] border-collapse">
                <thead>
                  <tr className="border-b border-blue-300/10 text-left text-sm text-slate-300">
                    <th className="w-20 px-2 py-3 font-black">#</th>
                    <th className="px-2 py-3 font-black">Nome</th>
                    <th className="px-2 py-3 font-black">Instagram</th>
                    <th className="px-2 py-3 text-right font-black">Acertos</th>
                    <th className="px-2 py-3 text-right font-black">Pontos</th>
                  </tr>
                </thead>
                <tbody>
                  {ranking.map((participante) => (
                    <tr
                      key={participante.instagram}
                      className="border-b border-blue-300/10 text-sm last:border-b-0"
                    >
                      <td className="px-2 py-3">
                        <span
                          className={`inline-flex h-10 w-10 items-center justify-center rounded-full text-base font-black ${medalhaClasse(
                            participante.posicao,
                          )}`}
                        >
                          {participante.posicao}
                        </span>
                      </td>
                      <td className="px-2 py-3">
                        <div className="flex items-center gap-3">
                          <ParticipantAvatar posicao={participante.posicao} />
                          <span className="font-bold text-white">
                            {participante.nome}
                          </span>
                        </div>
                      </td>
                      <td className="px-2 py-3 font-medium text-slate-300">
                        {participante.instagram}
                      </td>
                      <td className="px-2 py-3 text-right font-black text-slate-300">
                        {formatarPontos(participante.acertos)}
                      </td>
                      <td
                        className={`px-2 py-3 text-right text-xl font-black ${
                          participante.posicao === 1
                            ? "text-yellow-300"
                            : participante.posicao === 2
                              ? "text-slate-300"
                              : participante.posicao === 3
                                ? "text-orange-300"
                                : "text-slate-300"
                        }`}
                      >
                        {formatarPontos(participante.pontos)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="rounded-lg border border-blue-300/10 bg-blue-950/24 px-5 py-10 text-center">
                <p className="text-base font-black text-white">
                  Nenhum participante pontuou ainda.
                </p>
              </div>
            )}

            {ranking.length > 0 ? (
              <a
                href={todosParticipantesUrl}
                className="mt-5 inline-flex w-full items-center justify-center rounded-lg border border-blue-300/10 bg-blue-900/34 px-5 py-4 text-sm font-black text-slate-200 transition hover:border-blue-300/30 hover:bg-blue-800/50"
              >
                Ver todos os participantes
              </a>
            ) : null}
          </div>
        </article>

        <aside className="space-y-5">
          <article className="rounded-lg border border-blue-400/25 bg-slate-950/68 p-5 shadow-[0_20px_70px_rgba(0,0,0,0.28)] backdrop-blur">
            <h2 className="mb-5 flex items-center gap-3 text-xl font-black">
              <span className="text-2xl">📘</span>
              Oferta relâmpago da Liga
            </h2>

            <div className="flex gap-5">
              <ThemeCover imagemUrl={tema.imagemUrl} temaAtual={tema.temaAtual} />

              <div className="min-w-0 space-y-3">
                <h3 className="text-xl font-black leading-tight text-white">
                  Garanta {tema.temaAtual} com desconto
                </h3>
                <p className="text-sm leading-6 text-slate-300">
                  Esta condição especial só fica disponível enquanto a
                  legislação estiver ativa no Ranking Legis.
                </p>
                <p className="text-sm leading-6 text-slate-300">
                  Quando a Liga acabar, a oferta sai do ar junto. Aproveite
                  antes do encerramento da rodada.
                </p>
              </div>
            </div>

            <a
              href={tema.cursoUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-6 inline-flex w-full items-center justify-center rounded-lg bg-blue-600 px-5 py-4 text-center text-sm font-black text-white shadow-[0_14px_30px_rgba(37,99,235,0.32)] transition hover:-translate-y-0.5 hover:bg-blue-500"
            >
              Garantir desconto antes de acabar
            </a>
          </article>

          <article className="rounded-lg border border-blue-400/25 bg-slate-950/68 p-5 shadow-[0_20px_70px_rgba(0,0,0,0.28)] backdrop-blur">
            <h2 className="mb-5 flex items-center gap-3 text-xl font-black">
              <span className="text-xl text-yellow-300">⚡</span>
              Última rodada
            </h2>

            <div className="space-y-3">
              {rodada.length > 0 ? (
                rodada.map((participante) => (
                  <div
                    key={`${participante.data}-${participante.instagram}-${participante.colocacao}`}
                    className="flex items-center justify-between gap-4 rounded-md border border-blue-300/10 bg-blue-950/24 px-3 py-3 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="font-black text-white">
                        {participante.colocacao}º {participante.nome}
                      </p>
                      <p className="truncate text-xs font-medium text-slate-300">
                        {participante.instagram}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-yellow-400/15 px-3 py-1 text-xs font-black text-yellow-200">
                      +{formatarPontos(participante.pontosGanhos)}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-sm leading-6 text-slate-300">
                  A próxima rodada será exibida aqui.
                </p>
              )}
            </div>
          </article>

          <article className="rounded-lg border border-blue-400/25 bg-slate-950/68 p-5 shadow-[0_20px_70px_rgba(0,0,0,0.28)] backdrop-blur">
            <h2 className="mb-5 flex items-center gap-3 text-xl font-black">
              <span className="text-xl text-yellow-300">★</span>
              Regras da pontuação
            </h2>

            <div className="space-y-3">
              {regrasPontuacao.map(([regra, pontos]) => (
                <div
                  key={regra}
                  className="flex items-center justify-between gap-4 text-sm"
                >
                  <span className="text-slate-100">{regra}</span>
                  <span className="shrink-0 rounded-full bg-blue-950/70 px-3 py-1 text-xs font-black text-slate-100">
                    {pontos}
                  </span>
                </div>
              ))}
            </div>
          </article>
        </aside>
      </section>

      <section className="overflow-hidden rounded-lg border border-blue-400/25 bg-[radial-gradient(circle_at_top_left,rgba(250,204,21,0.14),transparent_34%),linear-gradient(135deg,rgba(8,22,52,0.92),rgba(2,8,23,0.96))] shadow-[0_24px_80px_rgba(0,0,0,0.32)] backdrop-blur">
        <div className="grid gap-0 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="flex flex-col justify-between gap-8 border-b border-blue-300/10 p-6 sm:p-8 lg:border-b-0 lg:border-r">
            <div className="space-y-5">
              <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-yellow-400/15 text-4xl shadow-inner shadow-yellow-200/10">
                🏆
              </div>
              <div className="space-y-3">
                <p className="text-xs font-black uppercase tracking-[0.22em] text-yellow-200">
                  Temporada oficial
                </p>
                <h2 className="text-3xl font-black leading-tight text-white sm:text-4xl">
                  Premiação Oficial da Liga
                </h2>
                <p className="max-w-xl text-base leading-7 text-slate-300">
                  Os vencedores devem solicitar um cupom de desconto de alguma
                  lei do catálogo.
                </p>
              </div>
            </div>

            <div className="grid gap-3">
              {regrasPremiacao.map((regra) => (
                <div
                  key={regra}
                  className="rounded-md border border-blue-300/10 bg-blue-950/30 px-4 py-3 text-sm font-bold text-slate-200"
                >
                  {regra}
                </div>
              ))}

              <a
                href={siteConfig.links.whatsapp}
                target="_blank"
                rel="noreferrer"
                className="inline-flex w-full items-center justify-center rounded-lg bg-green-500 px-5 py-4 text-center text-sm font-black text-white shadow-[0_14px_30px_rgba(34,197,94,0.24)] transition hover:-translate-y-0.5 hover:bg-green-400"
              >
                Solicitar cupom pelo WhatsApp
              </a>
            </div>
          </div>

          <div className="p-5 sm:p-6">
            <div className="grid gap-3 sm:grid-cols-2">
              {premiacaoOficial.map(([posicao, desconto], index) => {
                const destaque =
                  index === 0
                    ? "border-yellow-300/50 bg-yellow-400/15 text-yellow-100"
                    : index === 1
                      ? "border-slate-200/35 bg-slate-200/10 text-slate-100"
                      : index === 2
                        ? "border-orange-300/40 bg-orange-400/12 text-orange-100"
                        : "border-blue-300/10 bg-blue-950/28 text-slate-100";

                return (
                  <div
                    key={posicao}
                    className={`flex items-center justify-between gap-4 rounded-lg border px-4 py-4 shadow-[0_12px_34px_rgba(0,0,0,0.18)] ${destaque}`}
                  >
                    <span className="text-sm font-black">{posicao}</span>
                    <span className="text-xl font-black sm:text-2xl">
                      {desconto}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {tema.playlistYoutubeLiga ? (
        <section className="overflow-hidden rounded-lg border border-red-400/20 bg-[radial-gradient(circle_at_top_left,rgba(239,68,68,0.18),transparent_32%),linear-gradient(135deg,rgba(15,23,42,0.94),rgba(2,8,23,0.98))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.3)] backdrop-blur sm:p-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-5">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-red-300/25 bg-red-500/15 text-3xl text-red-100 shadow-[0_18px_38px_rgba(239,68,68,0.18)]">
                ▶
              </div>

              <div className="min-w-0 space-y-3">
                <h2 className="text-2xl font-black leading-tight text-white sm:text-3xl">
                  🎥 Continue estudando no YouTube
                </h2>
                <p className="max-w-2xl text-base leading-7 text-slate-300">
                  Resolva dezenas de questões comentadas da legislação desta
                  rodada e fortaleça sua memorização.
                </p>
              </div>
            </div>

            <a
              href={tema.playlistYoutubeLiga}
              target="_blank"
              rel="noreferrer"
              className="inline-flex shrink-0 items-center justify-center rounded-lg bg-red-600 px-6 py-4 text-center text-sm font-black text-white shadow-[0_16px_34px_rgba(220,38,38,0.28)] transition hover:-translate-y-0.5 hover:bg-red-500 sm:min-w-64"
            >
              ▶ Assistir playlist da Liga
            </a>
          </div>
        </section>
      ) : null}
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
