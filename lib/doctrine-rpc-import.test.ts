import { describe, expect, it, vi } from "vitest";
import { importDoctrineViaRpc } from "./doctrine-rpc-import";
import type { DoctrinePersistencePlan } from "./doctrine-persistence-plan";

const plan: DoctrinePersistencePlan = {
  slug: "direito-administrativo", titulo: "Direito Administrativo", tipoConteudo: "doutrina",
  structures: [{ key: "structure-1", nome: "01 - Estado", ordem: 1, tipo: "estrutura" }],
  questions: [{ id: "7ea93a63-951d-4f08-b90f-d3d460981a50", assunto: "Estado", ordem: "001", pergunta: "P", resposta: "Certo", justificativa: "J", resumo: null, totalTopicos: 105, fonteReferencia: null, versaoFonte: null, structureKey: "structure-1", legislacao: null, artigo: null, totalArtigos: null }],
};

describe("adaptador RPC de importação de doutrina", () => {
  it("usa o ID administrativo recebido do servidor, e não um campo da prévia", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { contentId: 42 }, error: null });
    await expect(importDoctrineViaRpc({ rpc }, { administratorUserId: "server-verified-user", ordem: 12, plan })).resolves.toEqual({ contentId: 42 });
    expect(rpc).toHaveBeenCalledWith("admin_importar_doutrina", expect.objectContaining({ p_ator_user_id: "server-verified-user", p_slug: "direito-administrativo" }));
  });

  it("não chama a RPC sem uma identidade administrativa ou ordem válida", async () => {
    const rpc = vi.fn();
    await expect(importDoctrineViaRpc({ rpc }, { administratorUserId: "", ordem: 12, plan })).rejects.toMatchObject({ status: 401 });
    await expect(importDoctrineViaRpc({ rpc }, { administratorUserId: "admin", ordem: -1, plan })).rejects.toMatchObject({ status: 422 });
    expect(rpc).not.toHaveBeenCalled();
  });
});
