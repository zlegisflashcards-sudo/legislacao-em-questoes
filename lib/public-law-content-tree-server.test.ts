import { describe, expect, it } from "vitest";
import { loadPublicLawCommercialSummary, loadPublicLawContentTree, type PublicLawContentTreeDatabase } from "./public-law-content-tree-server";

type TableRows = Record<string, Record<string, unknown>[]>;

function database(rows: TableRows): PublicLawContentTreeDatabase {
  return {
    from(table) {
      const result: { data: Record<string, unknown>[]; error: null } = { data: rows[table] ?? [], error: null };
      const promise = Promise.resolve(result);
      const query = {
        select: () => query,
        eq: () => query,
        then: promise.then.bind(promise),
      };
      return query;
    },
  };
}

const rows = {
  leis: [{ id: 1 }],
  law_structure: [
    { id: 1, parent_id: null, tipo: "titulo", nome: "Título I", ordem: 1, internal_note: "não retornar" },
    { id: 2, parent_id: 1, tipo: "capitulo", nome: "Capítulo I", ordem: 1, audio_not_applicable: false },
  ],
  questions: [{ structure_id: 2, pergunta: "conteúdo privado" }],
  legiscast_audios: [{ structure_id: 2, storage_path: "privado.mp3", signed_url: "não retornar" }],
};

describe("loader público da árvore de conteúdo", () => {
  it("projeta estado legislativo e módulos somente dos campos canônicos", async () => {
    const summary = await loadPublicLawCommercialSummary({ lawId: 1, db: database({
      ...rows,
      leis: [{ id: 1, situacao_atualizacao: "atualizado", houve_alteracao_legislativa: true, ultima_alteracao_referencia: "Lei nº 1/2026", norma_originaria_referencia: "Lei nº 1/2000", observacao_interna: "não retornar" }],
      admin_law_overview_checks: [{ item: "materiais" }, { item: "legiscast" }, { item: "invalido" }],
    }) });
    expect(summary).toEqual({
      legislation: { status: "updated", reference: "Lei nº 1/2026" },
      modules: { materiais: true, anki: false, legiscast: true, questoes: false },
    });
    expect(JSON.stringify(summary)).not.toContain("observacao_interna");
  });

  it("usa a norma originária e informa pendência para os demais estados editoriais", async () => {
    const summary = await loadPublicLawCommercialSummary({ lawId: 1, db: database({
      ...rows,
      leis: [{ id: 1, situacao_atualizacao: "em_revisao", houve_alteracao_legislativa: false, norma_originaria_referencia: "Lei nº 2/2001" }],
    }) });
    expect(summary?.legislation).toEqual({ status: "pending", reference: "Lei nº 2/2001" });
  });

  it("retorna somente a projeção necessária para renderização", async () => {
    const tree = await loadPublicLawContentTree({ lawId: 1, db: database(rows) });
    expect(tree).toEqual([{
      id: 1, parent_id: null, tipo: "titulo", nome: "Título I", ordem: 1, questionCount: 1, hasOwnLegiscast: false, audioNotApplicable: false, hasLegiscast: true,
      children: [{ id: 2, parent_id: 1, tipo: "capitulo", nome: "Capítulo I", ordem: 1, questionCount: 1, hasOwnLegiscast: true, audioNotApplicable: false, hasLegiscast: true, children: [] }],
    }]);
    expect(JSON.stringify(tree)).not.toContain("conteúdo privado");
    expect(JSON.stringify(tree)).not.toContain("privado.mp3");
    expect(JSON.stringify(tree)).not.toContain("signed_url");
    expect(JSON.stringify(tree)).not.toContain("internal_note");
  });

  it("preserva Não se aplica como estado resolvido do nó sem retornar dados administrativos extras", async () => {
    const tree = await loadPublicLawContentTree({ lawId: 1, db: database({
      ...rows,
      law_structure: [{ id: 1, parent_id: null, tipo: "titulo", nome: "Título I", ordem: 1, audio_not_applicable: true }],
      questions: [],
      legiscast_audios: [],
    }) });
    expect(tree?.[0]).toMatchObject({ hasOwnLegiscast: false, audioNotApplicable: true, hasLegiscast: true });
    expect(tree?.[0]).not.toHaveProperty("audio_not_applicable");
  });

  it("valida o recorte e limita a projeção à sua estrutura autorizada", async () => {
    const scopedRows = {
      ...rows,
      recortes_leis: [{ id: "scope", lei_id: 1 }],
      recortes_leis_estrutura: [{ structure_id: 2 }],
      questions: [{ structure_id: 1 }, { structure_id: 2 }],
      legiscast_audios: [{ structure_id: 1 }, { structure_id: 2 }],
    };
    const tree = await loadPublicLawContentTree({ lawId: 1, recorteId: "scope", db: database(scopedRows) });
    expect(tree?.[0]).toMatchObject({ questionCount: 1, hasLegiscast: true });
    expect(tree?.[0].children[0]).toMatchObject({ questionCount: 1, hasLegiscast: true });
  });

  it("falha fechada quando a lei ou o recorte não é elegível", async () => {
    expect(await loadPublicLawContentTree({ lawId: 1, db: database({ ...rows, leis: [] }) })).toBeNull();
    expect(await loadPublicLawContentTree({ lawId: 1, recorteId: "ausente", db: database({ ...rows, recortes_leis: [] }) })).toBeNull();
  });
});
