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
    expect(lawPage).toContain('action: "Revisar erros"');
    expect(lawPage).toContain('action: "Ver favoritos"');
    expect(lawPage).toContain('action: "Estudar pendentes"');
    expect(lawPage.indexOf('<ReviewHub slug={slug} counts={reviewCounts} />')).toBeLessThan(lawPage.indexOf('Resetar Estudo Ativo da Lei'));
  });

  it("mantém a revisão no player, sem repetir os atalhos e sem retirar a estrela", () => {
    expect(player).not.toContain('function ReviewShortcuts');
    expect(player).toContain('revisao${review ? `?tipo=${review}` : ""}');
    expect(player).toContain('<FavoriteButton slug={slug} questionId={favoriteQuestionId} />');
    expect(player).toContain('aria-label={favorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}');
  });
});
