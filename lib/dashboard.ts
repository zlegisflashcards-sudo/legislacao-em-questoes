export type DashboardEdital = {
  nome: string;
  progresso: number | null;
  url: string;
};

export type DailyReviewState = {
  dataRevisao: string | null;
  hojeConcluida: boolean;
  streakAtual: number;
};

export type DashboardData = {
  nomePublico: string | null;
  editalAtivo: DashboardEdital | null;
  revisao: DailyReviewState;
};

export const EMPTY_REVIEW_STATE: DailyReviewState = {
  dataRevisao: null,
  hojeConcluida: false,
  streakAtual: 0,
};

export function normalizeProgress(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function dailyGuidance(completedToday: boolean) {
  return completedToday
    ? "Revisão concluída. Agora você pode avançar no seu edital."
    : "Faça primeiro sua revisão diária antes de avançar para um novo conteúdo.";
}

export function parseDailyReviewRpc(value: unknown): DailyReviewState {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") return EMPTY_REVIEW_STATE;
  const data = row as Record<string, unknown>;
  const streak = Number(data.streak_atual ?? 0);
  return {
    dataRevisao: typeof data.data_revisao === "string" ? data.data_revisao : null,
    hojeConcluida: data.hoje_concluida === true,
    streakAtual: Number.isSafeInteger(streak) && streak >= 0 ? streak : 0,
  };
}
