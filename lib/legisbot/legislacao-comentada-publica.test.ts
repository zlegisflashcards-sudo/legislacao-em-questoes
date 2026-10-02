import { describe, expect, it } from "vitest";
import { consolidarLegislacaoComentadaConfiavel } from "./legislacao-comentada-publica";

const question = (overrides: Partial<{ id: string; slug: string; ordem: string; titulo: string; assunto: string; legislacao: string; updated_at: string }> = {}) => ({
  id: "question-1",
  slug: "cp",
  ordem: "0001",
  titulo: "Código Penal",
  assunto: "Art. 1º",
  legislacao: "<p>Não há crime sem lei anterior.</p>",
  updated_at: "2026-10-02T10:00:00.000Z",
  ...overrides,
});

describe("legislação comentada confiável do LegisCast", () => {
  it("mantém um artigo confiável sem comentário publicado", () => {
    expect(consolidarLegislacaoComentadaConfiavel([question()], [], "Código Penal")).toEqual([expect.objectContaining({ slug: "CP", ordem: "0001", comentario: null })]);
  });

  it("anexa somente comentário concluído e com conteúdo", () => {
    const contexts = consolidarLegislacaoComentadaConfiavel([question()], [
      { slug: "CP", ordem: "0001", status: "pendente", comentario: "Rascunho" },
      { slug: "CP", ordem: "0001", status: "concluido", comentario: "Comentário aprovado" },
    ], "Código Penal");
    expect(contexts[0]?.comentario).toBe("Comentário aprovado");
  });

  it("exclui um contexto com conflito real de assunto ou legislação", () => {
    expect(consolidarLegislacaoComentadaConfiavel([
      question(),
      question({ id: "question-2", assunto: "Art. 2º" }),
      question({ id: "question-3", ordem: "0002", legislacao: "<p>Outro dispositivo.</p>" }),
      question({ id: "question-4", ordem: "0002", legislacao: "<p>Texto divergente.</p>" }),
    ], [], "Código Penal")).toEqual([]);
  });
});
