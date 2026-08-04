import { describe, expect, it, vi } from "vitest";
import type { LegisBotComentario } from "@/lib/legisbot-comentario";
import { OpenAIServiceError } from "./generate-comment";
import { requestLegisBotGeneration } from "./generation-service";
import type {
  GenerationReservation,
  LegisBotGenerationRepository,
} from "./generation-repository";

const identifiers = { slug: "L11340", ordem: "0004.0.00.00" };
const input = { titulo: "Lei", assunto: "Art. 4º", legislacao: "Texto legal" };
const item: LegisBotComentario = {
  id: 10,
  ...identifiers,
  ...input,
  comentario: null,
  status: "processando",
  modelo_ia: null,
  processing_started_at: "2026-08-04T17:00:00.000Z",
  retry_after: null,
  attempt_count: 1,
  last_error_category: null,
  created_at: "2026-08-04T16:00:00.000Z",
  updated_at: "2026-08-04T17:00:00.000Z",
};

function reservation(decision: GenerationReservation["decision"]): GenerationReservation {
  return {
    decision,
    commentId: decision === "rate_limited" ? null : item.id,
    retryAfter: ["processing", "rate_limited", "cooldown"].includes(decision)
      ? "2026-08-04T17:10:00.000Z"
      : null,
    reservationStartedAt: decision === "reserved" ? item.processing_started_at : null,
  };
}

function repository(decision: GenerationReservation["decision"]): LegisBotGenerationRepository {
  return {
    reserve: vi.fn().mockResolvedValue(reservation(decision)),
    findById: vi.fn().mockResolvedValue(decision === "completed"
      ? { ...item, status: "concluido", comentario: "<p>Pronto</p>" }
      : item),
    complete: vi.fn().mockResolvedValue({ ...item, status: "concluido", comentario: "<p>Gerado</p>" }),
    fail: vi.fn().mockResolvedValue(undefined),
  };
}

describe("orquestração da geração do LegisBot", () => {
  it("não gera novamente conteúdo concluído", async () => {
    const repo = repository("completed");
    const generate = vi.fn();
    const result = await requestLegisBotGeneration({ repository: repo, generate }, "user-1", identifiers, input);
    expect(result.kind).toBe("completed");
    expect(generate).not.toHaveBeenCalled();
  });

  it.each(["processing", "rate_limited", "cooldown", "attempts_exhausted"] as const)(
    "não chama OpenAI quando a reserva decide %s",
    async (decision) => {
      const repo = repository(decision);
      const generate = vi.fn();
      const result = await requestLegisBotGeneration({ repository: repo, generate }, "user-1", identifiers, input);
      expect(result.kind).toBe(decision);
      expect(generate).not.toHaveBeenCalled();
    },
  );

  it("chama OpenAI uma vez e conclui usando o token da lease", async () => {
    const repo = repository("reserved");
    const generate = vi.fn().mockResolvedValue("<p>Gerado</p>");
    const result = await requestLegisBotGeneration({ repository: repo, generate }, "user-1", identifiers, input);
    expect(result.kind).toBe("generated");
    expect(generate).toHaveBeenCalledOnce();
    expect(repo.complete).toHaveBeenCalledWith(
      item.id,
      item.processing_started_at,
      "<p>Gerado</p>",
      "gpt-5.4-mini",
    );
  });

  it("duas solicitações concorrentes produzem somente uma chamada quando há uma reserva vencedora", async () => {
    const repo = repository("reserved");
    vi.mocked(repo.reserve)
      .mockResolvedValueOnce(reservation("reserved"))
      .mockResolvedValueOnce(reservation("processing"));
    const generate = vi.fn().mockResolvedValue("<p>Único</p>");
    const results = await Promise.all([
      requestLegisBotGeneration({ repository: repo, generate }, "user-1", identifiers, input),
      requestLegisBotGeneration({ repository: repo, generate }, "user-1", identifiers, input),
    ]);
    expect(results.map((result) => result.kind).sort()).toEqual(["generated", "processing"]);
    expect(generate).toHaveBeenCalledOnce();
  });

  it("registra falha e cooldown sem deixar a lease ativa", async () => {
    const repo = repository("reserved");
    const generate = vi.fn().mockRejectedValue(new OpenAIServiceError({
      categoria: "rate_limit",
      status: 429,
      technicalMessage: "rate limited",
    }));
    const result = await requestLegisBotGeneration({ repository: repo, generate }, "user-1", identifiers, input);
    expect(result.kind).toBe("temporary_failure");
    expect(repo.fail).toHaveBeenCalledWith(item.id, item.processing_started_at, "rate_limit");
  });

  it("não conclui quando a saída fica vazia após sanitização", async () => {
    const repo = repository("reserved");
    const result = await requestLegisBotGeneration(
      { repository: repo, generate: vi.fn().mockResolvedValue("<script>inseguro()</script>") },
      "user-1",
      identifiers,
      input,
    );
    expect(result.kind).toBe("failure");
    expect(repo.complete).not.toHaveBeenCalled();
    expect(repo.fail).toHaveBeenCalledWith(item.id, item.processing_started_at, "internal");
  });

  it("mantém o alerta administrativo de cota sem repetir a geração", async () => {
    const repo = repository("reserved");
    const generate = vi.fn().mockRejectedValue(new OpenAIServiceError({
      categoria: "quota",
      status: 429,
      technicalMessage: "quota",
    }));
    const alertQuota = vi.fn().mockResolvedValue("sent");
    const result = await requestLegisBotGeneration(
      { repository: repo, generate, alertQuota },
      "user-1",
      identifiers,
      input,
    );
    expect(result.kind).toBe("quota");
    expect(generate).toHaveBeenCalledOnce();
    expect(alertQuota).toHaveBeenCalledOnce();
  });

  it("não sobrescreve uma reserva mais nova se a conclusão perder a lease", async () => {
    const repo = repository("reserved");
    vi.mocked(repo.complete).mockResolvedValue(null);
    const result = await requestLegisBotGeneration(
      { repository: repo, generate: vi.fn().mockResolvedValue("<p>Tardia</p>") },
      "user-1",
      identifiers,
      input,
    );
    expect(result.kind).toBe("processing");
  });
});
