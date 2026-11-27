import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildBulkQuestionDeletionPayload, bulkDeletionConfirmationText } from "./admin-bulk-question-deletion";
import { createBulkDeletionPreviewToken, matchesBulkDeletionPreviewToken } from "./admin-bulk-question-deletion-server";
import { POST } from "../app/api/admin/questoes/route";

const data = vi.hoisted(() => ({
  user: "admin-a" as string | null,
  rows: {} as Record<string, Array<Record<string, unknown>>>,
  rpc: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/admin-auth", () => ({
  obterAdministrador: () => data.user ? { id: data.user } : null,
}));

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServerClient: () => ({
    rpc: data.rpc,
    from: (table: string) => {
      let rows = [...(data.rows[table] || [])];
      let cardinality: number | undefined;
      const builder: {
        select: () => typeof builder;
        eq: (key: string, value: unknown) => typeof builder;
        in: (key: string, values: unknown[]) => typeof builder;
        order: () => typeof builder;
        range: (start: number, end: number) => typeof builder;
        limit: (count: number) => typeof builder;
        maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: null }>;
        then: (resolve: (result: unknown) => unknown) => unknown;
      } = {
        select: () => builder,
        eq: (key, value) => { rows = rows.filter((row) => row[key] === value); return builder; },
        in: (key, values) => { rows = rows.filter((row) => values.includes(row[key])); return builder; },
        order: () => builder,
        range: (start, end) => { cardinality = rows.length; rows = rows.slice(start, end + 1); return builder; },
        limit: (count) => { rows = rows.slice(0, count); return builder; },
        maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
        then: (resolve) => resolve({ data: rows, count: cardinality ?? rows.length, error: null }),
      };
      return builder;
    },
  }),
}));

const chapterA = 101;
const childA = 102;
const chapterB = 103;
const recorteId = "00000000-0000-4000-8000-000000000002";
const qid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const question = (n: number, node: number, article: number, law = 90) => ({
  id: qid(n), lei_id: law, ativo: true, structure_id: node,
  ordem: `${String(article).padStart(4, "0")}.0.00.0.00.0`, pergunta: `Item fictício ${n}`, resposta: "Certo",
});
const makePayload = (changes: Partial<Parameters<typeof buildBulkQuestionDeletionPayload>[0]> = {}) =>
  buildBulkQuestionDeletionPayload({ lawSlug: "lei-teste", scope: "results", structureId: chapterA, scopeId: null, query: "", filter: "all", article: "", ...changes });
const preview = "resumo_exclusao_questoes";
const confirm = "excluir_questoes";
const executed = () => data.rpc.mock.calls.filter(([, args]) => args.p_execute);

async function post(action: string, target: Record<string, unknown>) {
  const response = await POST(new Request("http://127.0.0.1/api/admin/questoes", { method: "POST", body: JSON.stringify({ action, ...target }), headers: { "content-type": "application/json" } }));
  return { status: response.status, body: await response.json() };
}

describe("exclusão de questões no ADM, com banco inteiramente fictício", () => {
  beforeEach(() => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "chave-exclusivamente-ficticia");
    data.user = "admin-a";
    data.rows = {
      leis: [{ id: 90, slug: "lei-teste", ativo: true }],
      law_structure: [
        { id: chapterA, lei_id: 90, parent_id: null, nome: "Capítulo 1", tipo: "capitulo", ordem: 1, ativo: true },
        { id: childA, lei_id: 90, parent_id: chapterA, nome: "Seção 1", tipo: "secao", ordem: 1, ativo: true },
        { id: chapterB, lei_id: 90, parent_id: null, nome: "Capítulo 2", tipo: "capitulo", ordem: 2, ativo: true },
      ],
      recortes_leis: [{ id: recorteId, lei_id: 90, ativo: true, artigos_filtro: "1, 3" }],
      recortes_leis_estrutura: [
        { recorte_id: recorteId, lei_id: 90, structure_id: chapterA },
        { recorte_id: recorteId, lei_id: 90, structure_id: chapterB },
      ],
      questions: [question(1, chapterA, 1), question(2, childA, 2), question(3, chapterB, 3), question(4, chapterA, 1, 91)],
    };
    data.rpc.mockReset().mockImplementation((_name, args) => ({
      data: { questions_count: args.p_question_ids.length, campaigns_count: 0, campaigns: [], answers_count: 0, progresses_count: 0 },
      error: null,
    }));
  });
  afterEach(() => vi.unstubAllEnvs());

  it("reaplica a estrutura que foi selecionada na tela e nunca alarga o lote a outro capítulo ou lei", async () => {
    const target = makePayload();
    const first = await post(preview, target);
    expect(first.status).toBe(200);
    expect(first.body.questions_count).toBe(2);
    expect(executed()).toHaveLength(0);
    const last = await post(confirm, { ...target, confirmation: "EXCLUIR", preview_token: first.body.preview_token });
    expect(last.status).toBe(200);
    expect(executed()).toHaveLength(1);
    expect(executed()[0][1].p_question_ids).toEqual([qid(1), qid(2)]);
  });

  it.each(["results", "structure"] as const)("respeita interseção do capítulo com recorte por artigos no modo %s", async (scope) => {
    const target = makePayload({ scope, scopeId: recorteId });
    const first = await post(preview, target);
    expect(first.status).toBe(200);
    expect(first.body.questions_count).toBe(1);
    expect(data.rpc.mock.calls[0][1].p_question_ids).toEqual([qid(1)]);
    expect(executed()).toHaveLength(0);
  });

  it("verifica todas as páginas, sem limitar a exclusão à primeira página nem incluir outro capítulo", async () => {
    data.rows.questions.push(...Array.from({ length: 120 }, (_, i) => question(i + 10, childA, 2)));
    const target = makePayload();
    const first = await post(preview, target);
    expect(first.status).toBe(200);
    expect(first.body.questions_count).toBe(122);
    expect(executed()).toHaveLength(0);
    const final = await post(confirm, { ...target, confirmation: "EXCLUIR", preview_token: first.body.preview_token });
    expect(final.status).toBe(200);
    expect(executed()[0][1].p_question_ids).not.toContain(qid(3));
    expect(new Set(executed()[0][1].p_question_ids).size).toBe(122);
  });

  it("exige questões específicas da própria lei, ativas e sem duplicidade", async () => {
    const target = { law_slug: "lei-teste", scope: "questions", question_ids: [qid(1)] };
    expect((await post(preview, { ...target, question_ids: [qid(1), qid(1)] })).status).toBe(400);
    expect((await post(preview, { ...target, question_ids: [qid(4)] })).status).toBe(409);
    const first = await post(preview, target);
    expect(first.status).toBe(200);
    expect((await post(confirm, { ...target, confirmation: "EXCLUIR", preview_token: first.body.preview_token })).status).toBe(200);
    expect(executed()[0][1].p_question_ids).toEqual([qid(1)]);
  });

  it("bloqueia confirmação quando uma questão foi substituída por outra, mesmo com a mesma contagem", async () => {
    const target = makePayload();
    const first = await post(preview, target);
    data.rows.questions = [data.rows.questions[0], question(5, childA, 2), ...data.rows.questions.slice(2)];
    expect((await post(confirm, { ...target, confirmation: "EXCLUIR", preview_token: first.body.preview_token })).status).toBe(409);
    expect(executed()).toHaveLength(0);
  });

  it("bloqueia se houve alteração no impacto sobre campanhas", async () => {
    const target = makePayload();
    const first = await post(preview, target);
    data.rpc.mockImplementation((_name, args) => ({
      data: { questions_count: args.p_question_ids.length, campaigns_count: 1, campaigns: [{ id: "ficticia" }], answers_count: 1, progresses_count: 1 },
      error: null,
    }));
    expect((await post(confirm, { ...target, confirmation: "EXCLUIR", preview_token: first.body.preview_token })).status).toBe(409);
    expect(executed()).toHaveLength(0);
  });

  it("bloqueia sem prévia, sem filtro no modo resultados ou com confirmação comum para lei inteira", async () => {
    expect((await post(confirm, { ...makePayload(), confirmation: "EXCLUIR" })).status).toBe(409);
    expect((await post(preview, makePayload({ structureId: null }))).status).toBe(422);
    const target = makePayload({ scope: "all" });
    const first = await post(preview, target);
    expect(first.body.questions_count).toBe(3);
    expect((await post(confirm, { ...target, confirmation: "EXCLUIR", preview_token: first.body.preview_token })).status).toBe(422);
    expect(executed()).toHaveLength(0);
    expect((await post(confirm, { ...target, confirmation: bulkDeletionConfirmationText("all"), preview_token: first.body.preview_token })).status).toBe(200);
    expect(executed()[0][1].p_question_ids).toEqual([qid(1), qid(2), qid(3)]);
  });

  it("vincula a prévia ao administrador e ao escopo, mesmo que a lista de IDs seja a mesma", async () => {
    const target = makePayload();
    const first = await post(preview, target);
    expect((await post(confirm, { ...makePayload({ scope: "structure" }), confirmation: "EXCLUIR", preview_token: first.body.preview_token })).status).toBe(409);
    data.user = "admin-b";
    expect((await post(confirm, { ...target, confirmation: "EXCLUIR", preview_token: first.body.preview_token })).status).toBe(409);
    data.user = null;
    expect((await post(preview, target)).status).toBe(401);
    expect(executed()).toHaveLength(0);
  });
});

it("expira a prévia e rejeita token adulterado", () => {
  const binding = { actorId: "admin-ficticio", target: {}, ids: [qid(1)], impact: { campaigns: [], questions: 1, answers: 0, progress: 0 } };
  const now = 1_800_000_000_000;
  const token = createBulkDeletionPreviewToken("ficticio", binding, now);
  expect(matchesBulkDeletionPreviewToken("ficticio", token, binding, now + 100)).toBe(true);
  expect(matchesBulkDeletionPreviewToken("ficticio", token, binding, now + 1_000_000)).toBe(false);
  expect(matchesBulkDeletionPreviewToken("ficticio", token + "0", binding, now + 100)).toBe(false);
});
