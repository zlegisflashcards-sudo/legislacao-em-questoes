import { describe, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("@/lib/scoped-study-auth", () => ({ authorizeScopedStudy: auth }));
vi.mock("@/lib/legisbot/sanitize-legal-html-core", () => ({ sanitizeLegalHtmlCore: (html: string) => html.replace(/<script>[\s\S]*?<\/script>/g, "") }));
vi.mock("@/lib/law-study-server", () => ({
  LawStudyApiError: class extends Error { constructor(public status: number, message: string) { super(message); } },
  lawStudyErrorResponse: (error: { status: number; message: string }) => Response.json({ message: error.message }, { status: error.status }),
}));
import { scopedReadingDigest } from "./scoped-study-reading-pin";
function certificate(row: { id: string; lei_id: number; structure_id: number | null; ordem: string; identificacao: string; legislacao: string }) {
  return { recorte_id: recorte.id, reference_id: row.id, lei_id: row.lei_id, structure_id: row.structure_id, format_version: 1, revoked_at: null,
    sha256: scopedReadingDigest({ id: row.id, lawId: row.lei_id, structureId: row.structure_id, order: row.ordem,
      label: row.identificacao, changedAt: null, rawHtml: row.legislacao, shippedHtml: row.legislacao.replace(/<script>[\s\S]*?<\/script>/g, "").trim() }) };
}
import { GET } from "@/app/api/aluno/estudar/lei/[slug]/recorte-material/route";

const slug = "cf";
const recorte = { id: "09948964-6c60-48ea-9045-1cd861ec8550", nome: "Amostra" };
const opts = { params: Promise.resolve({ slug }) };
const request = (mode: string, extra = "") => new Request(`https://example.test/recorte-material?mode=${mode}&recorte_id=${recorte.id}${extra}`);
function context() {
  const seen: Record<string, unknown> = {};
  const db = { from: vi.fn((table: string) => {
    if (table === "scoped_reading_certificates") return {
      select() { return this; }, eq() { return this; },
      in() { return { error: null, data: [certificate({ id: "inside", lei_id: 9, ordem: "2", identificacao: "Art. 2º", structure_id: 2, legislacao: "<p>Autorizado</p><script>injetado</script>" })] }; },
    };
    const query = {
      select() { return query; },
      eq(key: string, value: unknown) { seen[key] = value; return query; },
      in(key: string, value: unknown) { seen[key] = value; return query; },
      not() { return query; }, or() { return query; }, order() { return query; },
      range() { return { error: null, data: [
        { id: "inside", ordem: "2", identificacao: "Art. 2º", structure_id: 2, legislacao: "<p>Autorizado</p><script>injetado</script>" },
        { id: "parent", ordem: "1", identificacao: "Capítulo", structure_id: 1, legislacao: "Pai misto" },
        { id: "outside", ordem: "6", identificacao: "Art. 6º", structure_id: 6, legislacao: "Fora do recorte" },
        { id: "null", ordem: "4", identificacao: "Sem vínculo", structure_id: null, legislacao: "Indeterminado" },
      ].map((row) => ({ ...row, lei_id: 9 })) }; },
    };
    return query;
  }), storage: { from: vi.fn() } };
  auth.mockResolvedValue({ lawId: 9, title: "Constituição", recorte, supabase: db, structureIds: [1, 2], structures: [{ id: 1, parent_id: null }, { id: 2, parent_id: 1 }, { id: 6, parent_id: 1 }] });
  return { db, seen };
}

describe("API por recorte: autorização e conteúdo devolvido", () => {
  it("não expõe artigos, ids/âncoras ou metadados externos mesmo com um lote inconsistente", async () => {
    const { seen } = context();
    const response = await GET(request("reading", "&structure_id=6&reference_id=outside"), opts);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(seen).toEqual({ lei_id: 9, structure_id: [2] });
    expect(await response.json()).toEqual({ title: "Constituição", recorte, blocks: [{ id: "inside", label: "Art. 2º", legislation: "<p>Autorizado</p>" }] });
  });
  it("não consulta arquivo nem assina áudio quando ainda não há confirmação editorial integral", async () => {
    const { db } = context();
    const response = await GET(request("audio", "&structure_id=6&audio_id=outside"), opts);
    expect(await response.json()).toEqual({ title: "Constituição", recorte, audios: [], status: "coverage_pending" });
    expect(db.from).not.toHaveBeenCalled();
    expect(db.storage.from).not.toHaveBeenCalled();
  });
  it.each([401, 403])("aplica a negativa %i antes de buscar conteúdo", async (status) => {
    const { db } = context();
    auth.mockRejectedValueOnce({ status, message: "Indisponível" });
    const response = await GET(request("reading"), opts);
    expect(response.status).toBe(status);
    expect(db.from).not.toHaveBeenCalled();
  });
  it("rejeita escopo duplicado", async () => {
    const { db } = context();
    const response = await GET(request("reading", "&recorte_id=outro"), opts);
    expect(response.status).toBe(400);
    expect(db.from).not.toHaveBeenCalled();
  });
});

import approvedReferences from "./fixtures/cf-sample-prepared-reference-ownership.json";

type FixtureReference = {
  id: string; lei_id: number; ordem: string; identificacao: string; preparado_em: string;
  situacao: string; structure_id: number | null; legislacao: string;
};

/** Simula a preparação editorial futura, não um fallback/allowlist na rota. */
function applyFixtureOwnership(row: FixtureReference) {
  const binding = approvedReferences.find((expected) => expected.id === row.id);
  return binding && row.lei_id === 14 && row.preparado_em === binding.preparado_em &&
    row.ordem === binding.ordem && row.identificacao === binding.identificacao && row.situacao === binding.situacao &&
    row.structure_id === null
    ? { ...row, structure_id: binding.expected_structure_id }
    : row;
}

function manifestContext(rows: FixtureReference[]) {
  const db = {
    from: vi.fn((table: string) => {
      if (table === "scoped_reading_certificates") return {
        select() { return this; }, eq() { return this; },
        in(_: string, ids: string[]) { return { error: null, data: rows.filter((row) => ids.includes(row.id)).map(certificate) }; },
      };
      const columns = new Map<string, unknown>();
      const included = new Map<string, unknown[]>();
      const query = {
        select() { return query; }, eq(key: string, value: unknown) { columns.set(key, value); return query; },
        in(key: string, value: unknown[]) { included.set(key, value); return query; },
        not() { return query; }, or() { return query; }, order() { return query; },
        range(from: number, to: number) {
          const selected = rows.filter((row) => [...columns].every(([key, value]) => row[key as keyof FixtureReference] === value) &&
            [...included].every(([key, value]) => value.includes(row[key as keyof FixtureReference])));
          return { error: null, data: selected.slice(from, to + 1) };
        },
      };
      return query;
    }),
    storage: { from: vi.fn() },
  };
  auth.mockResolvedValue({ lawId: 14, title: "Constituição", recorte, supabase: db, structureIds: [438, 166], structures: [
    { id: 1, parent_id: null }, { id: 438, parent_id: 1 }, { id: 166, parent_id: 1 }, { id: 439, parent_id: 1 },
  ] });
  return db;
}

function manifestRows(): FixtureReference[] {
  return approvedReferences.map(({ id, ordem, identificacao, preparado_em, situacao }) => ({
    id, lei_id: 14, ordem, identificacao, preparado_em, situacao, structure_id: null, legislacao: `<p>Texto sintético ${id}</p>`,
  }));
}

describe("fixture com o manifesto editorial CF, arts. 1º a 5º", () => {
  it("retorna exatamente os 84 vínculos aprovados e nenhum conteúdo/âncora dos vizinhos", async () => {
    const raw = manifestRows();
    const rows = raw.map(applyFixtureOwnership);
    rows.push(
      { ...raw[0], id: "other-group", structure_id: 439, ordem: "0006.0.00.0.00.0", legislacao: "ART6_TOKEN" },
      { ...raw[0], id: "other-law", structure_id: 438, lei_id: 15, legislacao: "OTHER_LAW_TOKEN" },
      { ...raw[0], id: "no-binding", legislacao: "UNBOUND_TOKEN" },
    );
    const db = manifestContext(rows);
    const response = await GET(request("reading", "&structure_id=439&reference_id=other-group"), opts);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(new Set(data.blocks.map((block: { id: string }) => block.id))).toEqual(new Set(approvedReferences.map((ref) => ref.id)));
    expect(data.blocks).toHaveLength(84);
    expect(JSON.stringify(data)).not.toMatch(/ART6_TOKEN|OTHER_LAW_TOKEN|UNBOUND_TOKEN|other-group|other-law|no-binding/);
    expect(db.storage.from).not.toHaveBeenCalled();
  });

  it("nega vínculo local quando id, ordem, referência, lei, estado ou versão não coincidem", async () => {
    const raw = manifestRows();
    const changes = [
      { id: "not-reviewed" }, { ordem: "0006.0.00.0.00.0" }, { lei_id: 15 }, { identificacao: "Art. 6º" },
      { preparado_em: "2099-01-01T00:00:00Z" }, { situacao: "arquivada" },
    ];
    const rows = raw.map((row, i) => applyFixtureOwnership({ ...row, ...changes[i] }));
    expect(rows.slice(0, changes.length).every((row) => row.structure_id === null)).toBe(true);
    manifestContext(rows);
    const response = await GET(request("reading"), opts);
    const data = await response.json();
    expect(data.blocks).toHaveLength(84 - changes.length);
    expect(data.blocks.map((block: { id: string }) => block.id)).not.toEqual(expect.arrayContaining(raw.slice(0, changes.length).map(({ id }) => id)));
  });
});
