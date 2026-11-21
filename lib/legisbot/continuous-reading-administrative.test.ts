import { NextRequest } from "next/server";
import { GET as adminBlockRoute } from "@/app/api/admin/legisbot/[slug]/references/route";
import { GET as adminAudioRoute } from "@/app/api/admin/legisbot/[slug]/legiscast/route";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), lookupAdmin: vi.fn(), from: vi.fn(), audio: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin-auth", () => ({ exigirAdministrador: mocks.auth, obterAdministrador: mocks.lookupAdmin }));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseServerClient: () => ({ from: mocks.from }) }));
vi.mock("@/lib/question-legislative-reference-links", () => ({ listManualQuestionReferenceTargets: async () => [] }));

import { getAdministrativeContinuousReadingScope, getAdministrativeContinuousReadingBlockTexts, getContinuousReadingModel, getContinuousReadingBlockTextsForLaw } from "./continuous-reading-server";

vi.mock("@/lib/legiscast-audios-server", () => ({ getLegiscastAudioForLaw: mocks.audio }));

const id = "12345678-1234-4567-8123-123456789abc";
const siblingId = "22245678-1234-4567-8123-123456789abc";
const childId = "33345678-1234-4567-8123-123456789abc";
const ordem = "0001.0.00.0.00.0";
const slug = "lcp362comg";
const law = { id: 53, slug, titulo: "Plano Diretor", nome_curto: null, codigo: null };
const rows: Record<string, unknown> = {
  leis: law,
  questions: [{ id: "f1234567-1234-4567-8123-123456789abc", slug, ordem, structure_id: 7 }],
  legislative_references: [{ id, slug, ordem, identificacao: "Art. 1º", source_question_id: null, structure_id: 7, preparado_em: "2026-11-20", situacao: "preparada", legislacao: "<p>Texto preparado</p>" },
    { id: childId, slug, ordem: "0002.0.00.0.00.0", identificacao: "Art. 2", structure_id: 9, preparado_em: "2026-11-20", situacao: "preparada", legislacao: "<p>Filho preparado</p>" },
    { id: siblingId, slug, ordem: "0003.0.00.0.00.0", identificacao: "Art. 3", structure_id: 8, preparado_em: "2026-11-20", situacao: "preparada", legislacao: "<p>Irmão preparado</p>" }],
  law_structure: [{ id: 7, parent_id: null, tipo: "titulo", nome: "Título 01", ordem: 1, audio_not_applicable: true }, { id: 8, parent_id: null, tipo: "titulo", nome: "Vizinho", ordem: 2 }, { id: 9, parent_id: 7, tipo: "secao", nome:"Filho", ordem: 1 }],
  legisbot_configuracoes: { valor: "habilitado" },
  legislative_reference_inventory: [{ ordem }],
  legislative_structure_releases: [],
  article_context_mappings: [],
  legiscast_audios: [],
  legiscast_audio_structure_coverage: [],
};

function mockDatabase() {
  mocks.from.mockImplementation((table: string) => {
    let result = { data: rows[table], error: null };
    const query = {
      select: () => query, eq: () => query, order: () => query, or: () => query,
      not: () => query, in: (field: string, ids: string[]) => { if (table === "legislative_references" && field === "id") result = { data: (rows[table] as { id: string }[]).filter((row) => ids.includes(row.id)), error: null }; return query; }, range: async () => result,
      maybeSingle: async () => result,
      then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
    };
    return query;
  });
}

describe("simulação administrativa da Lei Interativa", () => {
  it("mantém o público sem blocos e devolve blocos preparados apenas à prévia administrativa", async () => {
    mockDatabase();
    mocks.auth.mockResolvedValue({ id: "admin-test" });
    const student = await getContinuousReadingModel(slug);
    expect(student?.publicAccess.mode).toBe("partial");
    expect(student?.integrity.readingAvailable).toBe(false);
    expect(student?.references).toEqual([]);
    await expect(getContinuousReadingBlockTextsForLaw(slug, [id])).resolves.toEqual([]);

    const admin = await getAdministrativeContinuousReadingScope(slug, 7);
    expect(admin?.references).toMatchObject([{ id, prepared: true, hierarchy: [{ id: 7 }] }, { id: childId, prepared: true, hierarchy: [{id: 7}, {id: 9}] }]);
    expect(admin?.structures.map((node) => node.id)).toEqual([7, 9]);
    await expect(getAdministrativeContinuousReadingBlockTexts(slug, 7, [id, childId, siblingId])).resolves.toEqual([{ id, legislation: "<p>Texto preparado</p>" }, { id: childId, legislation: "<p>Filho preparado</p>" }]);
  });

  it("nega prévia ou paginação antes de consultar dados se não for admin", async () => {
    mocks.auth.mockRejectedValue(new Error("sem administrador"));
    mocks.from.mockClear();
    await expect(getAdministrativeContinuousReadingScope(slug, 7)).rejects.toThrow("sem administrador");
    await expect(getAdministrativeContinuousReadingBlockTexts(slug, 7, [id])).rejects.toThrow("sem administrador");
    expect(mocks.from).not.toHaveBeenCalled();
  });
});


it("checks admin before serving scoped blocks or signing audio", async () => {
  const context = { params: Promise.resolve({ slug }) };
  const blocks = new NextRequest(`http://localhost/api/admin/legisbot/${slug}/references?structure_id=7&reference_ids=${id},${siblingId}`);
  const audio = new NextRequest(`http://localhost/api/admin/legisbot/${slug}/legiscast?structure_id=7`);
  mocks.lookupAdmin.mockResolvedValue(null);
  mocks.from.mockClear();
  expect((await adminBlockRoute(blocks, context)).status).toBe(401);
  expect((await adminAudioRoute(audio, context)).status).toBe(401);
  expect(mocks.from).not.toHaveBeenCalled();
  expect(mocks.audio).not.toHaveBeenCalled();

  mockDatabase();
  mocks.lookupAdmin.mockResolvedValue({ id: "admin-test" });
  mocks.auth.mockResolvedValue({ id: "admin-test" });
  const response = await adminBlockRoute(blocks, context);
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toContain("no-store");
  expect(await response.json()).toEqual({ blocks: [{ id, legislation: "<p>Texto preparado</p>" }] });
  mocks.audio.mockResolvedValue({ status: "direct", audio: { id: "fixture-track" } });
  expect(await (await adminAudioRoute(audio, context)).json()).toMatchObject({ status: "direct" });
  expect(mocks.audio).toHaveBeenCalledWith(law.id, "7");
});
