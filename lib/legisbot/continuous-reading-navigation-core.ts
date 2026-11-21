export type ContinuousReadingNavigationNode = {
  id: number;
  type: string;
  name: string;
};

export type ContinuousReadingNavigationReference = {
  id: string;
  hierarchy: ContinuousReadingNavigationNode[];
};

export type ContinuousReadingAdvance = {
  afterReferenceId: string;
  nextReferenceId: string;
  nextName: string;
};

type ReadingSegment = {
  identity: string;
  name: string;
  firstReferenceId: string;
  lastReferenceId: string;
};

function normalizedType(type: string) {
  return type.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function navigationOwner(reference: ContinuousReadingNavigationReference) {
  const chapter = [...reference.hierarchy].reverse().find((node) => normalizedType(node.type) === "capitulo");
  if (chapter) return chapter;
  // Artigos diretamente no Título fazem parte de um trecho próprio. Eles não
  // são encaixados artificialmente no capítulo seguinte.
  return [...reference.hierarchy].reverse().find((node) => normalizedType(node.type) === "titulo") ?? null;
}

function readingSegments(references: ContinuousReadingNavigationReference[]) {
  const segments: ReadingSegment[] = [];
  for (const reference of references) {
    const owner = navigationOwner(reference);
    // Se uma lei não usa nem Título nem Capítulo, não inventamos um trecho
    // navegável para Seção, Subseção ou outro nível menor.
    if (!owner) continue;
    const identity = `${normalizedType(owner.type)}:${owner.id}`;
    const previous = segments.at(-1);
    if (previous?.identity === identity) {
      previous.lastReferenceId = reference.id;
      continue;
    }
    segments.push({ identity, name: owner.name, firstReferenceId: reference.id, lastReferenceId: reference.id });
  }
  return segments;
}

/**
 * Um botão só nasce no último bloco real de um Capítulo (ou do trecho direto
 * de um Título). A lista de referências já deve conter somente ramos que o
 * aluno pode ver; por isso um ramo fechado nunca vira destino ou rótulo.
 */
export function continuousReadingAdvances(references: ContinuousReadingNavigationReference[]) {
  const advances = new Map<string, ContinuousReadingAdvance>();
  const segments = readingSegments(references);
  for (let index = 0; index < segments.length - 1; index += 1) {
    const current = segments[index];
    const next = segments[index + 1];
    advances.set(current.lastReferenceId, {
      afterReferenceId: current.lastReferenceId,
      nextReferenceId: next.firstReferenceId,
      nextName: next.name,
    });
  }
  return advances;
}

export function continuousReadingResumeStorageKey(input: { accountId: string; lawSlug: string; recorteId: string | null }) {
  return `legisbot:continuous-reading:resume:${input.accountId}:${input.lawSlug.trim().toLowerCase()}:${input.recorteId ?? "lei-completa"}`;
}

export function continuousReadingMarkerStorageKey(input: { accountId: string; lawSlug: string; recorteId: string | null }) {
  return `legisbot:continuous-reading:marker:${input.accountId}:${input.lawSlug.trim().toLowerCase()}:${input.recorteId ?? "lei-completa"}`;
}

type LocalReadingStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** Há apenas uma chave por contexto: gravar outro UUID substitui a parada
 * anterior. O UUID identifica o bloco terminado; a retomada abre o próximo. */
export function saveContinuousReadingMarker(storage: LocalReadingStorage, key: string, referenceId: string | null) {
  if (referenceId === null) storage.removeItem(key);
  else storage.setItem(key, referenceId);
}

export function readContinuousReadingMarker(storage: Pick<Storage, "getItem">, key: string) {
  return storage.getItem(key);
}

/** A parada aponta para o bloco já concluído. Só há continuação quando a
 * referência seguinte também veio da lista autorizada pelo servidor. */
export function resolveContinuousReadingPauseTarget<T extends ContinuousReadingNavigationReference>(input: {
  references: T[];
  pausedAfterReferenceId: string | null;
}) {
  if (!input.pausedAfterReferenceId) return null;
  const pausedIndex = input.references.findIndex((reference) => reference.id === input.pausedAfterReferenceId);
  return pausedIndex >= 0 ? input.references[pausedIndex + 1] ?? null : null;
}

/** Link direto sempre vence. Se a posição salva não estiver na lista já
 * autorizada pelo servidor, a leitura começa pelo primeiro dispositivo visível.
 * A parada manual representa o fim de um bloco: só é usada se o próximo bloco
 * também estiver na lista autorizada. */
export function resolveContinuousReadingResume<T extends ContinuousReadingNavigationReference>(input: {
  references: T[];
  savedReferenceId: string | null;
  pausedAfterReferenceId?: string | null;
  hasExplicitDestination: boolean;
}) {
  if (input.hasExplicitDestination) return null;
  const pauseTarget = resolveContinuousReadingPauseTarget({ references: input.references, pausedAfterReferenceId: input.pausedAfterReferenceId ?? null });
  if (pauseTarget) return pauseTarget;
  return input.references.find((reference) => reference.id === input.savedReferenceId)
    ?? input.references[0]
    ?? null;
}
