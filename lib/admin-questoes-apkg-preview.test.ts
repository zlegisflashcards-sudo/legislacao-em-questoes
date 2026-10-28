import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ImportedQuestion } from "@/lib/imported-question";
import { buildLawApkg } from "./anki-apkg-export";
import { parseLegisApkg } from "./anki-apkg-import";

type Question = {
  id: string; lei_id: number; ativo: boolean; pergunta: string; resposta: "Certo" | "Errado";
  justificativa: string | null; slug: string; ordem: string; titulo: string | null; assunto: string | null;
  legislacao: string | null; total_artigos: number | null; ultima_alteracao_legislativa: string | null;
};
const state = vi.hoisted(() => ({ rows: [] as Question[], identified: [] as Array<Pick<Question, "id" | "lei_id" | "ativo">> }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin-auth", () => ({ obterAdministrador: async () => ({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }) }));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseServerClient: () => ({
  from(table: string) {
    let selected = ""; let ids: string[] | null = null;
    const result = () => {
      if (table === "leis") return { data: { id: 1, slug: "lai", titulo: "LAI", nome_curto: null, codigo: null, ultima_alteracao_referencia: null, houve_alteracao_legislativa: false }, error: null };
      if (table === "law_structure") return { data: [], error: null };
      if (table === "questions" && selected === "id,lei_id,ativo") return { data: state.identified.filter((row) => ids?.includes(row.id)), error: null };
      return { data: state.rows, error: null };
    };
    const query: Record<string, unknown> = {
      select(value: string) { selected = value; return query; },
      eq() { return query; }, order() { return query; },
      in(_column: string, values: string[]) { ids = values; return query; },
      maybeSingle: async () => result(),
      then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) { return Promise.resolve(result()).then(resolve, reject); },
    };
    return query;
  },
}) }));

import { previewApkgImport, previewQuestionImport } from "./admin-questoes-server";

const id = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
const stored = (index: number, patch: Partial<Question> = {}): Question => ({
  id: id(index), lei_id: 1, ativo: true, pergunta: `Questão ${index}`, resposta: "Certo", justificativa: "Original",
  slug: "lai", ordem: `0001.0.00.${String(index).padStart(2, "0")}`, titulo: "LAI", assunto: "Assunto", legislacao: "Art. 1º",
  total_artigos: 1, ultima_alteracao_legislativa: null, ...patch,
});
const row = (question: Question, patch: Partial<ImportedQuestion> = {}): ImportedQuestion => ({
  line: 1, deck: [], pergunta: question.pergunta, resposta: question.resposta, justificativa: question.justificativa ?? "",
  slug: "lai", ordem: question.ordem, titulo: question.titulo ?? "", assunto: question.assunto ?? "", legislacao: question.legislacao ?? "",
  total_artigos: String(question.total_artigos ?? ""), ultima_alteracao_legislativa: question.ultima_alteracao_legislativa ?? "", id_questao: question.id, ...patch,
});

beforeEach(() => { state.rows = []; state.identified = []; });

describe("APKG preview identity against fetched questions", () => {
  it("runs a synthetic binary APKG with 124 UUID updates through parser and preview", async () => {
    state.rows = Array.from({ length: 124 }, (_, index) => stored(index + 1));
    state.identified = state.rows.map(({ id: questionId, lei_id, ativo }) => ({ id: questionId, lei_id, ativo }));
    const changed = state.rows.map((question, index) => ({
      ...question,
      structure_id: null,
      ...(index < 121 ? { ordem: `0001.0.01.${String(index + 1).padStart(2, "0")}` }
        : index === 121 ? { justificativa: "Justificativa binaria revisada 122" }
          : index === 122 ? { assunto: "Assunto binario revisado 123" }
            : { resposta: "Errado" as const }),
    }));
    const exported = await buildLawApkg({ slug: "lai", titulo: "LAI" }, changed, [], { fileName: "apkg-uuid-124-sintetico.apkg" });
    const parsed = await parseLegisApkg(exported.bytes);
    expect(parsed.rows).toHaveLength(124);
    expect([...parsed.rows.map((item) => item.id_questao)].sort()).toEqual([...changed.map((item) => item.id)].sort());
    const bytes = exported.bytes.buffer.slice(exported.bytes.byteOffset, exported.bytes.byteOffset + exported.bytes.byteLength) as ArrayBuffer;
    const preview = await previewApkgImport("lai", new File([bytes], exported.filename, { type: "application/octet-stream" }));
    expect(preview.summary).toMatchObject({ novas: 0, atualizadas: 124, duplicadas: 0, erros: 0 });
    expect(preview.items).toHaveLength(124);
    expect(preview.items.every((item) => item.status === "atualizada")).toBe(true);
    expect(preview.items.map((item) => item.existing_id)).toEqual(parsed.rows.map((item) => item.id_questao));
  }, 30_000);

  it("blocks a binary APKG that mixes one new row and one UUID update", async () => {
    const current = stored(1);
    state.rows = [current];
    state.identified = [{ id: current.id, lei_id: 1, ativo: true }];
    const exported = await buildLawApkg(
      { slug: "lai", titulo: "LAI" },
      [
        { ...current, structure_id: null, ordem: "0001.0.01.0.01.0" },
        { ...current, id: "", structure_id: null, pergunta: "Questao nova do APKG binario", ordem: "0002.0.00.00" },
      ],
      [],
      { fileName: "apkg-misto-sintetico.apkg" },
    );
    const parsed = await parseLegisApkg(exported.bytes);
    expect(parsed.rows.map((item) => item.id_questao)).toEqual([current.id, undefined]);
    const bytes = exported.bytes.buffer.slice(exported.bytes.byteOffset, exported.bytes.byteOffset + exported.bytes.byteLength) as ArrayBuffer;
    const preview = await previewApkgImport("lai", new File([bytes], exported.filename, { type: "application/octet-stream" }));
    expect(preview.summary).toMatchObject({ novas: 1, atualizadas: 1, erros: 1 });
    expect(preview.errors).toEqual(expect.arrayContaining([expect.objectContaining({ field: "lote" })]));
  }, 30_000);

  it("reproduz 121 Ordens alteradas e 3 inalteradas como 124 atualizações UUID, nunca novas", async () => {
    state.rows = Array.from({ length: 124 }, (_, index) => stored(index + 1));
    state.identified = state.rows.map(({ id: questionId, lei_id, ativo }) => ({ id: questionId, lei_id, ativo }));
    const rows = state.rows.map((question, index) => row(question, {
      line: index + 1,
      ...(index < 121 ? { ordem: `0001.0.01.${String(index + 1).padStart(2, "0")}` }
        : index === 121 ? { justificativa: "Justificativa revisada 122" }
          : index === 122 ? { assunto: "Assunto revisado 123" }
            : { justificativa: "Justificativa revisada 124" }),
    }));
    const preview = await previewQuestionImport("lai", { rows, issues: [] });
    expect(preview.summary).toMatchObject({ novas: 0, atualizadas: 124, duplicadas: 0, erros: 0 });
    expect(preview.items.filter((item) => item.status === "nova")).toHaveLength(0);
    expect(preview.items.find((item) => item.line === 1)).toMatchObject({ existing_id: id(1), status: "atualizada" });
  });

  it("bloqueia já na prévia o lote com questão nova e atualização UUID", async () => {
    const current = stored(1); state.rows = [current]; state.identified = [{ id: current.id, lei_id: 1, ativo: true }];
    const parsed = { rows: [row(current, { ordem: "0001.0.01.0.01.0" }), { ...row(current, { line: 2, id_questao: undefined, pergunta: "Questão realmente nova", ordem: "0002.0.00.00" }) }], issues: [] };
    const preview = await previewQuestionImport("lai", parsed, {}, { rootDecks: [], subdecks: [], notes: 2, cards: 2, recognizedModels: [], unrecognizedModels: [], media: [], samples: [] });
    expect(preview.summary).toMatchObject({ novas: 1, atualizadas: 1, erros: 1 });
    expect(preview.errors[0]?.field).toBe("lote");
    const txtPreview = await previewQuestionImport("lai", parsed);
    expect(txtPreview.summary.erros).toBe(0);
  });

  it("mantém UUID como identidade mesmo com duas perguntas iguais e rejeita UUID inválido/inativo/outra lei/inexistente", async () => {
    const first = stored(1); const second = stored(2, { pergunta: first.pergunta, ordem: "0001.0.00.02" });
    state.rows = [first, second];
    state.identified = [
      { id: first.id, lei_id: 1, ativo: true }, { id: second.id, lei_id: 1, ativo: true },
      { id: id(3), lei_id: 1, ativo: false }, { id: id(4), lei_id: 2, ativo: true },
    ];
    const preview = await previewQuestionImport("lai", { rows: [
      row(second, { pergunta: first.pergunta, ordem: "0001.0.01.0.02" }),
      row(first, { line: 2, id_questao: "not-a-uuid" }),
      row(first, { line: 3, id_questao: id(3) }), row(first, { line: 4, id_questao: id(4) }), row(first, { line: 5, id_questao: id(5) }),
    ], issues: [] });
    expect(preview.items[0]).toMatchObject({ existing_id: second.id, status: "atualizada" });
    expect(preview.items.slice(1).map((item) => item.motivo)).toEqual(["IDQuestao inválido.", "IDQuestao refere-se a uma questão inativa.", "IDQuestao pertence a outra lei.", "IDQuestao não existe."]);
  });
});
