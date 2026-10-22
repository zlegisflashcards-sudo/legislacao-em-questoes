import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ administrator: { id: "admin-1" } as { id: string } | null, updates: [] as Array<Record<string, unknown>>, nodes: [] as Array<Record<string, unknown>>, questions: [{ id: "q-1", structure_id: 3 }], audit: [] as Array<Record<string, unknown>> }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin-auth", () => ({ obterAdministrador: vi.fn(async () => state.administrator) }));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseServerClient: () => ({ from(table: string) {
  let patch: Record<string, unknown> | null = null; let selectedId: number | null = null;
  const result = () => table === "leis" ? { data: { id: 10, slug: "cf", titulo: "CF", nome_curto: null, codigo: null, ultima_alteracao_referencia: null, houve_alteracao_legislativa: null }, error: null } : { data: state.nodes, error: null };
  const chain: any = { select: () => chain, eq: (column: string, value: unknown) => { if (column === "id") selectedId = Number(value); return chain; }, is: () => chain, order: () => chain, update: (value: Record<string, unknown>) => { patch = value; return chain; }, maybeSingle: () => { if (table !== "law_structure" || !patch) return result(); const node = state.nodes.find((item) => Number(item.id) === selectedId); if (!node) return { data: null, error: null }; state.updates.push(patch); Object.assign(node, patch, { updated_at: "after" }); return { data: node, error: null }; }, then: (resolve: (value: unknown) => unknown) => resolve(result()) };
  return chain;
}, rpc: (name: string, args: Record<string, unknown>) => { state.audit.push(args); if (name === "admin_reparent_law_structure") { const node = state.nodes.find((item) => Number(item.id) === Number(args.p_structure_id))!; state.updates.push({ parent_id: args.p_new_parent_id }); Object.assign(node, { parent_id: args.p_new_parent_id, updated_at: "after" }); return Promise.resolve({ data: node, error: null }); } return Promise.resolve({ data: null, error: null }); } }) }));

import { AdminQuestoesError, previewStructureReparenting, reparentStructureNode } from "./admin-questoes-server";

const nodes = () => [
  { id: 1, lei_id: 10, parent_id: null, tipo: "titulo", nome: "Titulo", ordem: 1, ativo: true, updated_at: "one" },
  { id: 2, lei_id: 10, parent_id: 1, tipo: "secao", nome: "A", ordem: 1, ativo: true, updated_at: "two" },
  { id: 3, lei_id: 10, parent_id: 2, tipo: "subsecao", nome: "Filha", ordem: 2, ativo: true, updated_at: "three" },
  { id: 4, lei_id: 10, parent_id: 1, tipo: "secao", nome: "B", ordem: 3, ativo: true, updated_at: "four" },
];

describe("acoes administrativas de reparenting", () => {
  beforeEach(() => { state.administrator = { id: "admin-1" }; state.nodes = nodes(); state.questions = [{ id: "q-1", structure_id: 3 }]; state.updates = []; state.audit = []; });
  it("rejeita usuario nao administrador", async () => { state.administrator = null; await expect(previewStructureReparenting({ law_slug: "cf", id: 3, new_parent_id: 4 })).rejects.toMatchObject({ status: 401 } satisfies Partial<AdminQuestoesError>); });
  it("rejeita destino inexistente e ciclo", async () => { await expect(previewStructureReparenting({ law_slug: "cf", id: 3, new_parent_id: 99 })).rejects.toMatchObject({ status: 422 }); await expect(previewStructureReparenting({ law_slug: "cf", id: 2, new_parent_id: 3 })).rejects.toMatchObject({ status: 422 }); });
  it("rejeita destino de outra lei", async () => { state.nodes.push({ id: 9, lei_id: 11, parent_id: null, tipo: "secao", nome: "Outra lei", ordem: 1, ativo: true, updated_at: "nine" }); await expect(previewStructureReparenting({ law_slug: "cf", id: 3, new_parent_id: 9 })).rejects.toMatchObject({ status: 422 }); });
  it("preserva questoes e descendentes e atualiza somente parent_id", async () => { const preview = await previewStructureReparenting({ law_slug: "cf", id: 3, new_parent_id: 4 }); const beforeQuestions = structuredClone(state.questions); await reparentStructureNode({ law_slug: "cf", id: 3, new_parent_id: 4, expected: preview.expected }); expect(state.updates).toEqual([{ parent_id: 4 }]); expect(state.questions).toEqual(beforeQuestions); expect(state.nodes.find((node) => node.id === 3)).toMatchObject({ id: 3, parent_id: 4, nome: "Filha", ordem: 2 }); });
  it("rejeita confirmacao quando o estado mudou depois da previa", async () => { const preview = await previewStructureReparenting({ law_slug: "cf", id: 3, new_parent_id: 4 }); Object.assign(state.nodes.find((node) => node.id === 3)!, { updated_at: "concurrent", parent_id: 1 }); await expect(reparentStructureNode({ law_slug: "cf", id: 3, new_parent_id: 4, expected: preview.expected })).rejects.toMatchObject({ status: 409 }); expect(state.updates).toEqual([]); });
});
