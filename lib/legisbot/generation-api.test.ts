import { describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";
import type { LegisBotComentario } from "../legisbot-comentario";
import { handleLegisBotGenerationPost } from "./generation-api";
import type { LegisBotGenerationRepository } from "./generation-repository-types";
import { LegisBotSourceError } from "./source";

const user = { id: "6c31d2cf-6a66-4c58-8ada-ab117caf0326" } as User;
const item: LegisBotComentario = {
  id: 2,
  slug: "L123",
  ordem: "1",
  titulo: "Lei",
  assunto: "Art. 1º",
  legislacao: "Texto legal",
  comentario: null,
  status: "processando",
  modelo_ia: null,
  processing_started_at: "2026-08-04T17:00:00Z",
  retry_after: null,
  attempt_count: 1,
  last_error_category: null,
  source_signature: null,
  precisa_revisao: false,
  created_at: "2026-08-04T16:00:00Z",
  updated_at: "2026-08-04T17:00:00Z",
};

function request(body: unknown = {}) {
  return new Request("https://www.legisflashcards.com.br/api/legisbot/L123/1/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const source = { questionId: "q1", slug: "L123", ordem: "1", titulo: "Lei", assunto: "Art. 1º", legislacao: "<p>Texto legal</p>", promptLegislacao: "Texto legal", source_signature: "", signature: "a".repeat(64) };
const sourceDependencies = { resolveSource: vi.fn().mockResolvedValue(source), reconcileSource: vi.fn().mockResolvedValue(null) };

function repo(): LegisBotGenerationRepository {
  return {
    reserve: vi.fn().mockResolvedValue({
      decision: "reserved",
      commentId: item.id,
      retryAfter: null,
      reservationStartedAt: item.processing_started_at,
    }),
    findById: vi.fn().mockResolvedValue(item),
    complete: vi.fn().mockResolvedValue({ ...item, status: "concluido", comentario: "<p>Gerado</p>" }),
    fail: vi.fn(),
  };
}

describe("contrato do POST autenticado", () => {
  it("retorna 401 e não acessa o repositório sem sessão", async () => {
    const getRepository = vi.fn();
    const response = await handleLegisBotGenerationPost(request(), { slug: "L123", ordem: "1" }, {
      authenticate: vi.fn().mockResolvedValue(null),
      getRepository,
      ...sourceDependencies,
    });
    expect(response.status).toBe(401);
    expect(getRepository).not.toHaveBeenCalled();
  });

  it("usa exclusivamente o id retornado pela autenticação", async () => {
    const repository = repo();
    const response = await handleLegisBotGenerationPost(
      request(),
      { slug: "l123", ordem: "1" },
      {
        authenticate: vi.fn().mockResolvedValue(user),
        getRepository: () => repository,
        generate: vi.fn().mockResolvedValue("<p>Gerado</p>"),
        ...sourceDependencies,
      },
    );
    expect(response.status).toBe(200);
    expect(repository.reserve).toHaveBeenCalledWith(user.id, { slug: "L123", ordem: "1" }, expect.objectContaining({ titulo: "Lei", assunto: "Art. 1º", legislacao: "<p>Texto legal</p>" }));
  });

  it("rejeita Content-Type incorreto antes de criar o repositório", async () => {
    const getRepository = vi.fn();
    const invalidRequest = new Request("https://www.legisflashcards.com.br/api/legisbot/L123/1/generate", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "texto",
    });
    const response = await handleLegisBotGenerationPost(invalidRequest, { slug: "L123", ordem: "1" }, {
      authenticate: vi.fn().mockResolvedValue(user),
      getRepository,
      ...sourceDependencies,
    });
    expect(response.status).toBe(415);
    expect(getRepository).not.toHaveBeenCalled();
  });

  it("retorna 202 sem chamar OpenAI quando a RPC informa processamento", async () => {
    const repository = repo();
    vi.mocked(repository.reserve).mockResolvedValue({
      decision: "processing",
      commentId: item.id,
      retryAfter: "2026-08-04T17:02:00Z",
      reservationStartedAt: null,
    });
    const generate = vi.fn();
    const response = await handleLegisBotGenerationPost(request(), { slug: "L123", ordem: "1" }, {
      authenticate: vi.fn().mockResolvedValue(user),
      getRepository: () => repository,
      generate,
      ...sourceDependencies,
    });
    expect(response.status).toBe(202);
    expect(generate).not.toHaveBeenCalled();
  });

  it("rejeita conteúdo legal forjado pelo navegador", async () => {
    const getRepository = vi.fn();
    const response = await handleLegisBotGenerationPost(request({ titulo: "Forjado", legislacao: "Texto adulterado" }), { slug: "L123", ordem: "1" }, {
      authenticate: vi.fn().mockResolvedValue(user), getRepository, ...sourceDependencies,
    });
    expect(response.status).toBe(400);
    expect(getRepository).not.toHaveBeenCalled();
  });

  it("rejeita slug + ordem sem flashcard antes de reservar ou chamar OpenAI", async () => {
    const repository = repo();
    const generate = vi.fn();
    const response = await handleLegisBotGenerationPost(request(), { slug: "L404", ordem: "9" }, {
      authenticate: vi.fn().mockResolvedValue(user),
      getRepository: () => repository,
      resolveSource: vi.fn().mockRejectedValue(new LegisBotSourceError("not_found", "Trecho não encontrado.")),
      reconcileSource: vi.fn(),
      generate,
    });
    expect(response.status).toBe(404);
    expect(repository.reserve).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });

  it("não reserva nem chama OpenAI quando a fonte está em conflito editorial", async () => {
    const repository = repo();
    const generate = vi.fn();
    const response = await handleLegisBotGenerationPost(request(), { slug: "L123", ordem: "1" }, {
      authenticate: vi.fn().mockResolvedValue(user),
      getRepository: () => repository,
      resolveSource: vi.fn().mockRejectedValue(new LegisBotSourceError("conflict", "Este conteúdo está temporariamente indisponível enquanto passa por revisão.")),
      reconcileSource: vi.fn(),
      generate,
    });
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ reason: "source_conflict" });
    expect(repository.reserve).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });
});
