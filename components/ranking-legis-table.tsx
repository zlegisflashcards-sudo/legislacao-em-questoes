"use client";

import { useRef, useState } from "react";
import type { RankingParticipant } from "@/lib/ranking-sheets";

type RankingLegisTableProps = {
  ranking: RankingParticipant[];
};

const TOP_LIMIT = 10;

function formatarNumero(numero: number) {
  return new Intl.NumberFormat("pt-BR").format(numero);
}

export function RankingLegisTable({ ranking }: RankingLegisTableProps) {
  const [expanded, setExpanded] = useState(false);
  const tableStartRef = useRef<HTMLDivElement>(null);
  const canExpand = ranking.length > TOP_LIMIT;
  const visibleRanking =
    expanded || !canExpand ? ranking : ranking.slice(0, TOP_LIMIT);
  const buttonText = expanded
    ? "Mostrar apenas Top 10"
    : "Ver classificação completa";

  function toggleExpanded() {
    setExpanded((currentExpanded) => {
      const nextExpanded = !currentExpanded;

      if (!nextExpanded) {
        window.requestAnimationFrame(() => {
          tableStartRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        });
      }

      return nextExpanded;
    });
  }

  if (ranking.length === 0) {
    return (
      <div className="px-5 py-10 text-center">
        <p className="rounded-lg border border-blue-300/10 bg-blue-950/24 px-5 py-8 text-base font-black text-white">
          Nenhum participante pontuou ainda.
        </p>
      </div>
    );
  }

  return (
    <div ref={tableStartRef}>
      <div className="overflow-x-auto px-5 py-3">
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr className="border-b border-blue-300/10 text-left text-xs uppercase tracking-[0.12em] text-slate-400">
              <th className="w-24 px-2 py-4 font-black">Posi&ccedil;&atilde;o</th>
              <th className="px-2 py-4 font-black">Participante</th>
              <th className="px-2 py-4 text-right font-black">Pontos</th>
              <th className="px-2 py-4 text-right font-black">Acertos</th>
            </tr>
          </thead>
          <tbody className="transition-opacity duration-300 ease-out">
            {visibleRanking.map((participante) => (
              <tr
                key={participante.instagram}
                className="border-b border-blue-300/10 text-sm last:border-b-0"
              >
                <td className="px-2 py-4">
                  <span className="inline-flex h-9 min-w-9 items-center justify-center rounded-full border border-blue-300/15 bg-blue-950/44 px-3 text-base font-black text-slate-100">
                    {participante.posicao}
                  </span>
                </td>
                <td className="px-2 py-4">
                  <div className="space-y-1">
                    <p className="font-black text-white">{participante.nome}</p>
                    <p className="font-medium text-slate-400">
                      {participante.instagram}
                    </p>
                  </div>
                </td>
                <td className="px-2 py-4 text-right text-xl font-black text-blue-200">
                  {formatarNumero(participante.pontos)}
                </td>
                <td className="px-2 py-4 text-right font-black text-slate-300">
                  {formatarNumero(participante.acertos)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canExpand ? (
        <div className="border-t border-blue-300/10 px-5 py-5 text-center">
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls="ranking-legis-classificacao"
            onClick={toggleExpanded}
            className="inline-flex w-full items-center justify-center rounded-lg border border-blue-300/20 bg-blue-950/42 px-5 py-3 text-sm font-black text-slate-100 transition duration-200 hover:border-blue-300/45 hover:bg-blue-900/55 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:ring-offset-2 focus:ring-offset-slate-950 sm:w-auto sm:min-w-72"
          >
            {buttonText}
          </button>
        </div>
      ) : null}
    </div>
  );
}
