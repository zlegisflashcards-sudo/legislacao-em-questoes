import { describe, expect, it } from "vitest";
import {
  legiscastStructureFreshness,
  legiscastTrackFreshness,
} from "./legiscast-audio-freshness";

describe("controle de atualização editorial do LegisCast", () => {
  it("não usa uma alteração global da lei para desatualizar o áudio", () => {
    expect(legiscastTrackFreshness({ ativo: true, created_at: "2026-10-10" })).toBe("current");
  });

  it("mantém a marcação manual de desatualizado mesmo sem alteração cadastrada", () => {
    expect(legiscastTrackFreshness({
      ativo: true,
      publicado_em: "2026-11-18",
      situacao_atualizacao_manual: "desatualizado",
    })).toBe("outdated");
  });

  it("aceita a revisão manual até uma nova alteração do bloco", () => {
    expect(legiscastTrackFreshness({
      ativo: true,
      created_at: "2026-10-10",
      situacao_atualizacao_manual: "atual",
      situacao_atualizacao_em: "2026-11-19",
    }, "2026-11-18")).toBe("current");

    expect(legiscastTrackFreshness({
      ativo: true,
      created_at: "2026-10-10",
      situacao_atualizacao_manual: "atual",
      situacao_atualizacao_em: "2026-11-19",
    }, "2026-12-01")).toBe("outdated");
  });

  it("marca como desatualizado o áudio anterior ao texto do bloco e preserva uma revisão posterior", () => {
    const track = { ativo: true, created_at: "2026-11-10" };
    expect(legiscastTrackFreshness(track, "2026-11-18T13:00:00Z")).toBe("outdated");
    expect(legiscastTrackFreshness({
      ...track,
      situacao_atualizacao_manual: "atual",
      situacao_atualizacao_em: "2026-11-19T10:00:00Z",
    }, "2026-11-18T13:00:00Z")).toBe("current");
    expect(legiscastTrackFreshness({
      ...track,
      situacao_atualizacao_manual: "atual",
      situacao_atualizacao_em: "2026-11-19T10:00:00Z",
    }, "2026-11-20T13:00:00Z")).toBe("outdated");
  });

  it("não deixa faixa inativa cobrir uma estrutura", () => {
    expect(legiscastStructureFreshness([
      { ativo: false, publicado_em: "2026-11-18" },
    ])).toBe("none");
  });
});
