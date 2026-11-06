import { describe, expect, it, vi } from "vitest";
import { DoctrineAdminError, registerDoctrinePlan } from "./doctrine-admin-service";
import type { DoctrinePersistencePlan } from "./doctrine-persistence-plan";
import type { DoctrineRegistrationStore } from "./doctrine-admin-service";

const plan: DoctrinePersistencePlan = {
  slug: "direito-administrativo", titulo: "Direito Administrativo", tipoConteudo: "doutrina",
  structures: [{ key: "structure-1", nome: "01 - Noções", ordem: 1, tipo: "estrutura" }],
  questions: [{ id: "7ea93a63-951d-4f08-b90f-d3d460981a50", assunto: "Estado", ordem: "001", pergunta: "P", resposta: "Certo", justificativa: "J", resumo: null, totalTopicos: 105, fonteReferencia: null, versaoFonte: null, structureKey: "structure-1", legislacao: null, artigo: null, totalArtigos: null }],
};

describe("cadastro transacional de doutrina", () => {
  it("cria apenas dentro da transação após confirmar ausência de colisão", async () => {
    const createDoctrine = vi.fn().mockResolvedValue({ contentId: 42 });
    const runInTransaction: DoctrineRegistrationStore["runInTransaction"] = async (operation) => operation();
    const result = await registerDoctrinePlan({ runInTransaction, findContentBySlug: vi.fn().mockResolvedValue(null), createDoctrine }, plan);
    expect(result).toEqual({ contentId: 42 });
    expect(createDoctrine).toHaveBeenCalledWith(plan);
  });

  it("não grava quando o slug já existe", async () => {
    const createDoctrine = vi.fn();
    const runInTransaction: DoctrineRegistrationStore["runInTransaction"] = async (operation) => operation();
    await expect(registerDoctrinePlan({ runInTransaction, findContentBySlug: vi.fn().mockResolvedValue({ id: 7 }), createDoctrine }, plan))
      .rejects.toMatchObject({ status: 409 } satisfies Partial<DoctrineAdminError>);
    expect(createDoctrine).not.toHaveBeenCalled();
  });
});
