import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin-auth", () => ({ exigirAdministrador: vi.fn() }));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseServerClient: vi.fn() }));

import { exigirAdministrador } from "./admin-auth";
import { getSupabaseServerClient } from "./supabase-server";
import { importLegislativeDocument, previewLegislativeDocumentImport } from "./admin-legislative-references";

type StoredReference = { id: string; ordem: string; legislacao: string | null; structure_id: number | null; updated_at: string };

const source = new TextEncoder().encode("## TÍTULO I\n### CAPÍTULO I\n# Art. 1º\nTexto oficial.");

function expectedFrom(preview: Awaited<ReturnType<typeof previewLegislativeDocumentImport>>) {
  return preview.references.map(({ ordem, identification, legislation, operation, structureId, structureStatus, existingId, existingUpdatedAt, linkExisting }) => ({
    ordem, identification, legislation, operation, structureId, structureStatus, existingId, existingUpdatedAt, linkExisting,
  }));
}

function setup(records: StoredReference[] = []) {
  const state = { records };
  const calls = { inventory: [] as unknown[], updates: [] as Array<Record<string, unknown>>, inserts: [] as unknown[] };
  const structures = [
    { id: 1, parent_id: null, nome: "TÍTULO I", ordem: 1 },
    { id: 2, parent_id: 1, nome: "CAPÍTULO I", ordem: 2 },
  ];
  const from = vi.fn((table: string) => {
    let updatePayload: Record<string, unknown> | null = null;
    const query: Record<string, unknown> = {};
    for (const method of ["select", "eq", "in", "or", "order", "is"] as const) query[method] = vi.fn(() => query);
    query.update = vi.fn((payload: Record<string, unknown>) => { updatePayload = payload; calls.updates.push(payload); return query; });
    query.insert = vi.fn((payload: unknown) => { calls.inserts.push(payload); return query; });
    query.upsert = vi.fn((payload: unknown) => { calls.inventory.push(payload); return Promise.resolve({ data: null, error: null }); });
    query.maybeSingle = vi.fn(async () => {
      if (table === "leis") return { data: { id: 10, slug: "plano-diretor" }, error: null };
      if (table === "legislative_references" && updatePayload) return { data: { id: "ref-1" }, error: null };
      if (table === "legislative_references") return { data: null, error: null };
      return { data: null, error: null };
    });
    query.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
      const result = table === "law_structure"
        ? { data: structures, error: null }
        : table === "legislative_references"
          ? { data: state.records, error: null }
          : { data: [], error: null };
      return Promise.resolve(result).then(resolve, reject);
    };
    return query;
  });
  vi.mocked(getSupabaseServerClient).mockReturnValue({ from } as unknown as ReturnType<typeof getSupabaseServerClient>);
  return { calls, state };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(exigirAdministrador).mockResolvedValue({ id: "admin" } as never);
});

describe("importação de documento com estrutura editorial", () => {
  it("bloqueia ausência de marcador antes de gravar inventário ou bloco", async () => {
    const { calls } = setup();
    const bytes = new TextEncoder().encode("# Art. 1º\nTexto oficial.");
    const preview = await previewLegislativeDocumentImport({ lawSlug: "plano-diretor", name: "plano.md", bytes });
    expect(preview.canConfirm).toBe(false);
    expect(preview.references[0]).toMatchObject({ structureStatus: "sem_marcador", structureId: null });
    await expect(importLegislativeDocument({ lawSlug: "plano-diretor", name: "plano.md", bytes, expected: expectedFrom(preview) })).rejects.toThrow("Nenhum inventário ou texto foi gravado");
    expect(calls.inventory).toEqual([]);
    expect(calls.inserts).toEqual([]);
  });

  it("recusa o lote inteiro se algum trecho estiver fora de um título de dispositivo", async () => {
    const { calls } = setup();
    const bytes = new TextEncoder().encode("## TÍTULO I\n### CAPÍTULO I\nTexto sem título.\n# Art. 1º\nTexto oficial.");
    const preview = await previewLegislativeDocumentImport({ lawSlug: "plano-diretor", name: "plano.md", bytes });
    expect(preview.rejected).toHaveLength(1);
    expect(preview.canConfirm).toBe(false);
    await expect(importLegislativeDocument({ lawSlug: "plano-diretor", name: "plano.md", bytes, expected: expectedFrom(preview) })).rejects.toThrow("Nenhum inventário ou texto foi gravado");
    expect(calls.inventory).toEqual([]);
    expect(calls.inserts).toEqual([]);
  });

  it("rejeita a estrutura selecionada de outra lei ou inativa", async () => {
    setup();
    await expect(previewLegislativeDocumentImport({
      lawSlug: "plano-diretor", name: "plano.md", bytes: source, structureSelections: { "0001.0.00.0.00.0": 999 },
    })).rejects.toThrow("não pertence a esta lei ou não está ativa");
  });

  it("exige nova prévia quando o bloco mudou antes da confirmação", async () => {
    const { calls, state } = setup([{ id: "ref-1", ordem: "0001.0.00.0.00.0", legislacao: null, structure_id: null, updated_at: "v1" }]);
    const preview = await previewLegislativeDocumentImport({ lawSlug: "plano-diretor", name: "plano.md", bytes: source });
    state.records[0].updated_at = "v2";
    await expect(importLegislativeDocument({ lawSlug: "plano-diretor", name: "plano.md", bytes: source, expected: expectedFrom(preview) })).rejects.toThrow("base mudaram desde a prévia");
    expect(calls.inventory).toEqual([]);
  });

  it("vincula bloco já preenchido sem reimportar ou substituir o texto", async () => {
    const { calls } = setup([{ id: "ref-1", ordem: "0001.0.00.0.00.0", legislacao: "<p>Texto preservado.</p>", structure_id: null, updated_at: "v1" }]);
    const input = { lawSlug: "plano-diretor", name: "plano.md", bytes: source, linkExisting: ["0001.0.00.0.00.0"] };
    const preview = await previewLegislativeDocumentImport(input);
    expect(preview.references[0]).toMatchObject({ operation: "vincular", structureId: 2, linkExisting: true });
    await expect(importLegislativeDocument({ ...input, expected: expectedFrom(preview) })).resolves.toMatchObject({ linked: 1, created: 0, filled: 0 });
    expect(calls.updates).toEqual([{ structure_id: 2 }]);
    expect(calls.inserts).toEqual([]);
  });
});
