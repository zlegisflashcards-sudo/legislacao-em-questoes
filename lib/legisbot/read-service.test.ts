import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { LegisBotComentario } from "../legisbot-comentario";
import { readLegisBotComment } from "./read-service";
import { handleLegisBotRead } from "./read-api";

const item: LegisBotComentario = {
  id: 1,
  slug: "CF",
  ordem: "0001",
  titulo: "Constituição",
  assunto: "Art. 1º",
  legislacao: "Texto",
  comentario: "<p>Comentário</p>",
  status: "concluido",
  modelo_ia: "modelo",
  processing_started_at: null,
  retry_after: null,
  attempt_count: 1,
  last_error_category: null,
  source_signature: "a".repeat(64),
  precisa_revisao: false,
  created_at: "2026-08-04T00:00:00Z",
  updated_at: "2026-08-04T00:00:00Z",
};

describe("contrato de leitura pública do LegisBot", () => {
  const source = { questionId: "q1", slug: "CF", ordem: "0001", titulo: "Constituição", assunto: "Art. 1º", legislacao: "<p>Texto</p>", promptLegislacao: "Texto", signature: "a".repeat(64) };
  const dependencies = (value: LegisBotComentario | null) => ({ find: vi.fn().mockResolvedValue(value), resolveSource: vi.fn().mockResolvedValue(source), reconcileSource: vi.fn().mockResolvedValue(value) });
  it("retorna comentário concluído", async () => {
    const find = vi.fn().mockResolvedValue(item);
    await expect(readLegisBotComment(find)).resolves.toMatchObject({ kind: "completed", item });
    expect(find).toHaveBeenCalledOnce();
  });

  it("GET público concluído retorna HTTP 200 e no-store", async () => {
    const response = await handleLegisBotRead({ slug: "cf", ordem: "0001" }, dependencies(item));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({ success: true, source: "database" });
  });

  it("retorna processing para item em geração", async () => {
    await expect(readLegisBotComment(async () => ({ ...item, status: "processando", comentario: null })))
      .resolves.toMatchObject({ kind: "processing" });
  });

  it("retorna not_found sem criar item", async () => {
    const find = vi.fn().mockResolvedValue(null);
    await expect(readLegisBotComment(find)).resolves.toEqual({ kind: "not_found" });
    expect(find).toHaveBeenCalledOnce();
  });

  it("GET de item inexistente retorna HTTP 404", async () => {
    const response = await handleLegisBotRead({ slug: "CF", ordem: "0001" }, dependencies(null));
    expect(response.status).toBe(404);
  });

  it("o Route Handler GET não contém mutação, RPC, OpenAI ou alerta", () => {
    const route = readFileSync(join(process.cwd(), "app/api/legisbot/[slug]/[ordem]/route.ts"), "utf8");
    expect(route).toContain("export async function GET");
    expect(route).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.rpc\(/);
    expect(route).not.toMatch(/OpenAI|gerarComentario|Resend|enviarAlerta/);
    const readApi = readFileSync(join(process.cwd(), "lib/legisbot/read-api.ts"), "utf8");
    expect(readApi).toContain('"Cache-Control": "no-store"');
  });

  it("o polling usa somente GET e a geração permanece dentro da ação explícita", () => {
    const client = readFileSync(join(process.cwd(), "app/legisbot/legisbot-page-client.tsx"), "utf8");
    const effectStart = client.indexOf("async function carregarComentario");
    const actionStart = client.indexOf("async function gerarComentario");
    const pollingBlock = client.slice(effectStart, actionStart);
    const actionBlock = client.slice(actionStart);
    expect(pollingBlock).toContain("fetch(apiUrl");
    expect(pollingBlock).not.toContain("method: \"POST\"");
    expect(actionBlock).toContain("method: \"POST\"");
    expect(actionBlock).toContain("onClick={() => void gerarComentario()}");
  });
});
