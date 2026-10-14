type LawLegislativeUpdate = {
  houve_alteracao_legislativa?: boolean | null;
  ultima_alteracao_referencia?: string | null;
};

/**
 * Espelha o estado editorial da lei no Anki: quando há alteração cadastrada,
 * usa a identificação da norma alteradora. Sem alteração (ou com um cadastro
 * legado incompleto), informa a norma originária para que o campo nunca fique vazio.
 */
export function ankiLastLegislativeUpdate(law: LawLegislativeUpdate) {
  const lastChangeReference = law.houve_alteracao_legislativa === true ? law.ultima_alteracao_referencia?.trim() : "";
  return lastChangeReference || "Norma originária";
}
