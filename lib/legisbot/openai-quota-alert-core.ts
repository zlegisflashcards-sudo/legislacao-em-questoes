import type { DetalhesErroOpenAI } from "./openai-error";

export const JANELA_ALERTA_COTA_MS = 30 * 60 * 1000;

export type ContextoAlertaCotaOpenAI = {
  slug: string;
  ordem: string;
  titulo?: string | null;
  assunto?: string | null;
  occurredAt: Date;
};

export type DependenciasAlertaCota = {
  reservar: (janelaMs: number) => Promise<boolean>;
  enviar: (
    contexto: ContextoAlertaCotaOpenAI,
    detalhes: DetalhesErroOpenAI,
  ) => Promise<void>;
  log: Pick<Console, "info" | "error">;
};

export type ResultadoAlertaCota = "sent" | "suppressed" | "failed";

export async function processarAlertaCotaOpenAI(
  contexto: ContextoAlertaCotaOpenAI,
  detalhes: DetalhesErroOpenAI,
  dependencias: DependenciasAlertaCota,
): Promise<ResultadoAlertaCota> {
  let reservado: boolean;

  try {
    reservado = await dependencias.reservar(JANELA_ALERTA_COTA_MS);
  } catch {
    dependencias.log.error(
      "[LegisBot] Não foi possível reservar a janela do alerta de falta de créditos.",
    );
    return "failed";
  }

  if (!reservado) {
    dependencias.log.info(
      "[LegisBot] Alerta repetido de falta de créditos suprimido pela janela de 30 minutos.",
    );
    return "suppressed";
  }

  try {
    await dependencias.enviar(contexto, detalhes);
    return "sent";
  } catch {
    dependencias.log.error(
      "[LegisBot] Falha ao enviar o alerta administrativo de falta de créditos.",
    );
    return "failed";
  }
}

