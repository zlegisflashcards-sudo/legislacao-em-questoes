import { describe, expect, it } from "vitest";
import { continuousReadingAdvances, continuousReadingMarkerStorageKey, continuousReadingResumeStorageKey, readContinuousReadingMarker, resolveContinuousReadingPauseTarget, resolveContinuousReadingResume, saveContinuousReadingMarker } from "./continuous-reading-navigation-core";

const title = { id: 1, type: "titulo", name: "TÍTULO I" };
const chapterOne = { id: 2, type: "capitulo", name: "CAPÍTULO I — INÍCIO" };
const sectionOne = { id: 3, type: "secao", name: "SEÇÃO I" };
const chapterTwo = { id: 4, type: "capitulo", name: "CAPÍTULO II — FIM" };
const closedChapter = { id: 5, type: "capitulo", name: "CAPÍTULO III — FECHADO" };
const ref = (id: string, hierarchy: typeof title[]) => ({ id, hierarchy });

describe("navegação da leitura contínua", () => {
  it("avança somente ao terminar cada capítulo, mesmo quando o capítulo atravessa páginas", () => {
    const references = Array.from({ length: 31 }, (_, index) => ref(`c1-${index + 1}`, [title, chapterOne, sectionOne]));
    references.push(ref("c2-1", [title, chapterTwo]));
    const advances = continuousReadingAdvances(references);
    expect([...advances.keys()]).toEqual(["c1-31"]);
    expect(advances.get("c1-31")).toMatchObject({ nextReferenceId: "c2-1", nextName: chapterTwo.name });
    expect(advances.has("c1-30")).toBe(false);
  });

  it("mantém artigos diretamente no Título como trecho real, sem capítulo fictício", () => {
    const advances = continuousReadingAdvances([
      ref("title-article", [title]),
      ref("chapter-article", [title, chapterOne]),
    ]);
    expect(advances.get("title-article")).toMatchObject({ nextReferenceId: "chapter-article", nextName: chapterOne.name });
  });

  it("não oferece avanço depois do último trecho e não menciona ramo fechado ausente", () => {
    const advances = continuousReadingAdvances([
      ref("c1", [title, chapterOne]),
      ref("c2", [title, chapterTwo]),
      // O capítulo fechado não chegou da API autorizada e, portanto, não pode
      // virar o próximo destino.
    ]);
    expect(advances.get("c1")?.nextName).toBe(chapterTwo.name);
    expect(advances.has("c2")).toBe(false);
    expect([...advances.values()].some((item) => item.nextName === closedChapter.name)).toBe(false);
  });

  it("retoma depois da parada manual, preserva link direto e cai em alternativa segura", () => {
    const references = [ref("first", [title, chapterOne]), ref("last", [title, chapterTwo])];
    expect(resolveContinuousReadingPauseTarget({ references, pausedAfterReferenceId: "first" })?.id).toBe("last");
    expect(resolveContinuousReadingPauseTarget({ references, pausedAfterReferenceId: "last" })).toBeNull();
    expect(resolveContinuousReadingPauseTarget({ references, pausedAfterReferenceId: "closed" })).toBeNull();
    expect(resolveContinuousReadingResume({ references, savedReferenceId: "last", hasExplicitDestination: false })?.id).toBe("last");
    expect(resolveContinuousReadingResume({ references, savedReferenceId: "first", pausedAfterReferenceId: "first", hasExplicitDestination: false })?.id).toBe("last");
    expect(resolveContinuousReadingResume({ references, savedReferenceId: "first", pausedAfterReferenceId: "closed", hasExplicitDestination: false })?.id).toBe("first");
    expect(resolveContinuousReadingResume({ references, savedReferenceId: "closed", hasExplicitDestination: false })?.id).toBe("first");
    expect(resolveContinuousReadingResume({ references, savedReferenceId: "first", pausedAfterReferenceId: "first", hasExplicitDestination: true })).toBeNull();
    expect(resolveContinuousReadingResume({ references: [], savedReferenceId: "last", hasExplicitDestination: false })).toBeNull();
  });

  it("separa a retomada por conta, lei e recorte", () => {
    const base = { accountId: "aluno-a", lawSlug: "LC362", recorteId: null };
    expect(continuousReadingResumeStorageKey(base)).not.toBe(continuousReadingResumeStorageKey({ ...base, accountId: "aluno-b" }));
    expect(continuousReadingResumeStorageKey(base)).not.toBe(continuousReadingResumeStorageKey({ ...base, recorteId: "recorte-1" }));
    expect(continuousReadingResumeStorageKey(base)).not.toBe(continuousReadingResumeStorageKey({ ...base, lawSlug: "LC363" }));
  });

  it("salva, substitui, remove e relê um único marcador por contexto", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
    } as Storage;
    const key = continuousReadingMarkerStorageKey({ accountId: "aluno-a", lawSlug: "lc362", recorteId: null });
    saveContinuousReadingMarker(storage, key, "first");
    saveContinuousReadingMarker(storage, key, "last");
    // A segunda gravação é o estado que existirá ao reabrir a página.
    expect(readContinuousReadingMarker(storage, key)).toBe("last");
    saveContinuousReadingMarker(storage, key, null);
    expect(readContinuousReadingMarker(storage, key)).toBeNull();
  });

  it("isola a parada por contexto e ignora uma referência fechada", () => {
    const base = { accountId: "aluno-a", lawSlug: "lc362", recorteId: null };
    expect(continuousReadingMarkerStorageKey(base)).not.toBe(continuousReadingMarkerStorageKey({ ...base, accountId: "aluno-b" }));
    expect(continuousReadingMarkerStorageKey(base)).not.toBe(continuousReadingMarkerStorageKey({ ...base, lawSlug: "lc363" }));
    expect(continuousReadingMarkerStorageKey(base)).not.toBe(continuousReadingMarkerStorageKey({ ...base, recorteId: "recorte-1" }));
    const references = [ref("visible", [title, chapterOne])];
    expect(resolveContinuousReadingResume({ references, savedReferenceId: "visible", pausedAfterReferenceId: "closed", hasExplicitDestination: false })?.id).toBe("visible");
  });

  it("mantém avanço independente da parada manual", () => {
    const references = [ref("first", [title, chapterOne]), ref("last", [title, chapterTwo])];
    const advances = continuousReadingAdvances(references);

    expect(advances.get("first")?.nextReferenceId).toBe("last");
    expect(resolveContinuousReadingResume({ references, savedReferenceId: "first", pausedAfterReferenceId: "first", hasExplicitDestination: false })?.id).toBe("last");
  });
});
