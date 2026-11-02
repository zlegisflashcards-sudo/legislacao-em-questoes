import { describe, expect, it } from "vitest";
import { resolveActiveStudyKey } from "@/components/student-study-hub";
import type { StudentLaw } from "@/lib/student-laws";

function law(id: number, slug: string, recorteId: string | null = null): StudentLaw {
  return { id, slug, titulo: slug, nomeCurto: null, descricao: null, codigo: null, categoria: null, thumbnailUrl: null, ordem: id, totalFlashcards: 1, versaoMaterial: null, revisadoEm: null, publicadoEm: null, situacaoAtualizacao: "atualizado", houveAlteracaoLegislativa: false, referenciaNormativaAtual: null, tipoReferenciaNormativa: "originaria", studyContextId: recorteId, studyContextKind: recorteId ? "recorte" : "completa", studyContextName: recorteId ? "Edital" : "Lei completa" };
}

describe("seleção comportamental do hub", () => {
  const laws = [law(1, "codigo-penal"), law(2, "constituicao", "recorte-a")];

  it("retoma a última lei válida, incluindo seu contexto", () => {
    expect(resolveActiveStudyKey(laws, null, "2:recorte-a")).toBe("2:recorte-a");
  });

  it("prioriza a seleção do histórico do navegador sobre a persistida", () => {
    expect(resolveActiveStudyKey(laws, "1:completa", "2:recorte-a")).toBe("1:completa");
  });

  it("não seleciona uma lei automaticamente quando a seleção anterior não está mais elegível", () => {
    expect(resolveActiveStudyKey(laws, null, "999:completa")).toBeNull();
  });

  it("mantém o estado vazio honesto sem lei elegível", () => {
    expect(resolveActiveStudyKey([], "1:completa", "2:recorte-a")).toBeNull();
  });
});
