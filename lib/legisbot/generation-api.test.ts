import { describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";
import type { LegisBotComentario } from "../legisbot-comentario";
import { handleLegisBotGenerationPost } from "./generation-api";
import type { LegisBotGenerationRepository } from "./generation-repository-types";

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
  created_at: "2026-08-04T16:00:00Z",
  updated_at: "2026-08-04T17:00:00Z",
};

function request(body: unknown = { titulo: "Lei", assunto: "Art. 1º", legislacao: "Texto legal" }) {
  return new Request("https://www.legisflashcards.com.br/api/legisbot/L123/1/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

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
    });
    expect(response.status).toBe(401);
    expect(getRepository).not.toHaveBeenCalled();
  });

  it("usa exclusivamente o id retornado pela autenticação", async () => {
    const repository = repo();
    const response = await handleLegisBotGenerationPost(
      request({ titulo: "Lei", assunto: "Art. 1º", legislacao: "Texto", user_id: "forged" }),
      { slug: "l123", ordem: "1" },
      {
        authenticate: vi.fn().mockResolvedValue(user),
        getRepository: () => repository,
        generate: vi.fn().mockResolvedValue("<p>Gerado</p>"),
      },
    );
    expect(response.status).toBe(200);
    expect(repository.reserve).toHaveBeenCalledWith(user.id, { slug: "L123", ordem: "1" }, {
      titulo: "Lei",
      assunto: "Art. 1º",
      legislacao: "Texto",
    });
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
    });
    expect(response.status).toBe(202);
    expect(generate).not.toHaveBeenCalled();
  });
});
