import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const lawPage = readFileSync("components/law-study-page-client.tsx", "utf8");
const player = readFileSync("components/legis-questoes-study-client.tsx", "utf8");

describe("central de revisão da página da lei", () => {
  it("fica dentro do painel, entre o desempenho e o reset, e usa os contadores da revisão", () => {
    expect(lawPage).toContain('request(`/api/aluno/estudar/lei/${encodeURIComponent(slug)}/revisao`)');
    expect(lawPage).toContain('<ReviewHub slug={slug} counts={reviewCounts} />');
    expect(lawPage).toContain('title: "Caderno de erros"');
    expect(lawPage).toContain('title: "Caderno de favoritos"');
    expect(lawPage).toContain('title: "Caderno de pendências"');
    expect(lawPage).toContain('const router = useRouter()');
    expect(lawPage).toContain('const available = review.count > 0;');
    expect(lawPage).toContain('type="button" disabled={!available} onClick={() => router.push(href)}');
    expect(lawPage).toContain('aria-describedby={statusId}');
    expect(lawPage).toContain('Sem questões disponíveis.');
    expect(lawPage).toContain('rounded-full px-2 py-0.5 text-xs font-black');
    expect(lawPage).not.toContain('Link href={`/questoes/${encodeURIComponent(slug)}/estudar?livre=1&revisao=${review.kind}`}');
    expect(lawPage).not.toContain('Revisar erros');
    expect(lawPage).not.toContain('Ver favoritos');
    expect(lawPage).not.toContain('Estudar pendentes');
    expect(lawPage.indexOf('<ReviewHub slug={slug} counts={reviewCounts} />')).toBeLessThan(lawPage.indexOf('Resetar Estudo Ativo da Lei'));
  });

  it("mantém a revisão no player, sem repetir os atalhos e sem retirar a estrela", () => {
    expect(player).not.toContain('function ReviewShortcuts');
    expect(player).toContain('revisao${review ? `?tipo=${review}` : ""}');
    expect(player).toContain('<FavoriteButton slug={slug} questionId={favoriteQuestionId} />');
    expect(player).toContain('aria-label={favorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}');
  });
});
