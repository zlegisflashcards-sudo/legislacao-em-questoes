import { describe, expect, it, vi } from "vitest";
import { parseDoctrineTransfer, requestDoctrineAction } from "@/lib/doctrine-import-client";

const payload = { noteColumns: ["id", "guid", "mid", "did", "tags", "fields"], fieldNames: ["IDQuestao"], decks: {}, notes: [] };

describe("interface de importação de doutrina", () => {
  it("lê JSON e envia uma prévia sem identidade administrativa controlada pelo navegador", async () => {
    expect(parseDoctrineTransfer(JSON.stringify(payload))).toEqual(payload);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ preview: { slug: "direito-administrativo" } }) });
    await requestDoctrineAction(fetchMock, "previsualizar", payload, "direito-administrativo", 0);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(expect.objectContaining({ action: "previsualizar", slug: "direito-administrativo", ordem: 0 }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).not.toHaveProperty("actor");
  });

  it("mostra o erro retornado pela rota sem tentar uma segunda escrita", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({ error: "Migration transacional ainda não está ativa." }) });
    await expect(requestDoctrineAction(fetchMock, "importar", payload, "direito-administrativo", 0)).rejects.toThrow("Migration transacional ainda não está ativa.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
