export type CampaignLevelState = {
  id: number;
  ordem: number;
  chave_origem: string | null;
  questoes_ids: string[];
  proxima_posicao: number;
  pendencias_ids: string[];
  concluido: boolean;
};

export type CampaignSnapshotLevel = { chave: string; nome: string; ids: string[] };

export type CampaignLevelRepair = {
  id: number;
  questoesIds: string[];
  pendenciasIds: string[];
  concluido: boolean;
};

/**
 * Reabre somente blocos cuja questão ativa ainda não recebeu resposta nesta
 * campanha. Mantém posição, score e histórico; a questão reaparece na revisão
 * quando o bloco já tinha sido encerrado.
 */
export function reconcileOpenCampaignLevels(levels: CampaignLevelState[], snapshot: CampaignSnapshotLevel[], answeredIds: Set<string>) {
  const repairs: CampaignLevelRepair[] = [];
  const known = new Map(levels.map((level) => [level.chave_origem, level]));
  const additions: Array<{ ordem: number; chave_origem: string; nome: string; questoes_ids: string[] }> = [];
  let nextOrder = Math.max(-1, ...levels.map((level) => level.ordem)) + 1;

  for (const fresh of snapshot) {
    const current = known.get(fresh.chave) ?? null;
    const unanswered = fresh.ids.filter((id) => !answeredIds.has(id));
    if (!current) {
      if (unanswered.length) additions.push({ ordem: nextOrder++, chave_origem: fresh.chave, nome: fresh.nome, questoes_ids: unanswered });
      continue;
    }

    const additionsToSnapshot = fresh.ids.filter((id) => !current.questoes_ids.includes(id));
    const questoesIds = [...current.questoes_ids, ...additionsToSnapshot];
    const hasCurrentQuestion = current.proxima_posicao < current.questoes_ids.length || current.pendencias_ids.length > 0;
    if (!unanswered.length || hasCurrentQuestion) continue;

    // Questões anexadas após a posição atual seguem na primeira passagem.
    // UUIDs substituídos em um bloco já esgotado precisam entrar em revisão.
    const pendenciasIds = current.proxima_posicao < questoesIds.length
      ? current.pendencias_ids
      : [...new Set([...current.pendencias_ids, ...unanswered])];
    repairs.push({ id: current.id, questoesIds, pendenciasIds, concluido: false });
  }
  return { repairs, additions };
}
