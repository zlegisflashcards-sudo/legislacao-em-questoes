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

/** Mantém a campanha em curso na posição atual; conteúdo novo de bloco concluído vira pendência de revisão. */
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

    // Um bloco já ultrapassado não pode voltar a ser o nível atual. As novas
    // questões ficam no snapshot para o Caderno de pendências, sem alterar
    // posição, score ou a progressão da campanha principal.
    if (current.concluido) {
      repairs.push({ id: current.id, questoesIds, pendenciasIds: current.pendencias_ids, concluido: true });
      continue;
    }

    // Questões anexadas ao nível atual seguem na primeira passagem.
    const pendenciasIds = current.proxima_posicao < questoesIds.length
      ? current.pendencias_ids
      : [...new Set([...current.pendencias_ids, ...unanswered])];
    repairs.push({ id: current.id, questoesIds, pendenciasIds, concluido: false });
  }
  return { repairs, additions };
}
