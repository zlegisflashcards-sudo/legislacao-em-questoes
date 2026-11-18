import { describe, expect, it } from "vitest";
import {
  legiscastStructureFreshness,
  legiscastTrackFreshness,
} from "./legiscast-audio-freshness";

const changedLaw = {
  houve_alteracao_legislativa: true,
  ultima_alteracao_data: "2026-11-18",
};

describe("controle de atualização editorial do LegisCast", () => {
  it("marca como desatualizada uma faixa publicada antes da alteração da lei", () => {
    expect(legiscastTrackFreshness({ ativo: true, publicado_em: "2026-10-10" }, changedLaw)).toBe("outdated");
  });

  it("mantém a marcação manual de desatualizado mesmo sem alteração cadastrada", () => {
    expect(legiscastTrackFreshness({
      ativo: true,
      publicado_em: "2026-11-18",
      situacao_atualizacao_manual: "desatualizado",
    }, { houve_alteracao_legislativa: false })).toBe("outdated");
  });

  it("aceita a revisão manual somente para a mesma alteração legislativa", () => {
    expect(legiscastTrackFreshness({
      ativo: true,
      publicado_em: "2026-10-10",
      situacao_atualizacao_manual: "atual",
      situacao_atualizacao_alteracao_data: "2026-11-18",
    }, changedLaw)).toBe("current");

    expect(legiscastTrackFreshness({
      ativo: true,
      publicado_em: "2026-10-10",
      situacao_atualizacao_manual: "atual",
      situacao_atualizacao_alteracao_data: "2026-11-18",
    }, { ...changedLaw, ultima_alteracao_data: "2026-12-01" })).toBe("outdated");
  });

  it("não deixa faixa inativa cobrir uma estrutura", () => {
    expect(legiscastStructureFreshness([
      { ativo: false, publicado_em: "2026-11-18" },
    ], changedLaw)).toBe("none");
  });
});
