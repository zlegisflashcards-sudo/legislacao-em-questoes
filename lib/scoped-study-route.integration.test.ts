import { createServer, type Server } from "node:http";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ db: vi.fn(), provider: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseServerClient: fixture.db }));
vi.mock("@/lib/question-counts-server", () => ({ activeQuestionCountBySlug: vi.fn() }));
// Synthetic HTML is already safe; dependencies for the production sanitizer
// aren't installed in the isolated Vitest workspace.
vi.mock("@/lib/legisbot/sanitize-legal-html-core", () => ({ sanitizeLegalHtmlCore: (html: string) => html }));
import { scopedReadingDigest } from "./scoped-study-reading-pin";
import { GET } from "@/app/api/aluno/estudar/lei/[slug]/recorte-material/route";

const free = "10000000-0000-4000-8000-000000000001";
const paid = "10000000-0000-4000-8000-000000000002";
const sibling = "10000000-0000-4000-8000-000000000003";
const foreign = "10000000-0000-4000-8000-000000000004";
const inactive = "10000000-0000-4000-8000-000000000005";
const sameNode = "10000000-0000-4000-8000-000000000007";
const pending = "10000000-0000-4000-8000-000000000006";

type Row = Record<string, unknown>;
const rows: Record<string, Row[]> = {
  leis: [{ id: 14, slug: "cf", ativo: true, status_publicacao: "ativa", titulo: "CF", acesso_gratuito: false }],
  alunos: ["free-student", "paid-owner", "sibling-owner"].map((id) => ({ id, user_id: id })),
  recortes_leis: [[free, 14, true, true, "ativa"], [paid, 14, false, true, "ativa"], [sibling, 14, false, true, "ativa"],
    [foreign, 15, true, true, "ativa"], [inactive, 14, true, false, "ativa"], [pending, 14, true, true, "em_breve"], [sameNode, 14, true, true, "ativa"]]
    .map(([id, lei_id, acesso_gratuito, ativo, status_publicacao]) => ({ id, lei_id, acesso_gratuito, ativo, status_publicacao, nome: String(id) })),
  liberacoes_leis: [{ aluno_id: "paid-owner", produto_id: "lp" }, { aluno_id: "sibling-owner", produto_id: "ls" }]
    .map((row) => ({ ...row, lei_id: 14, status: "ativo" })),
  produto_leis: [{ produto_id: "lp", recorte_id: paid }, { produto_id: "ls", recorte_id: sibling }]
    .map((row) => ({ ...row, lei_id: 14 })),
  law_structure: [1, 2, 3, 4].map((id) => ({ id, lei_id: 14, ativo: true, parent_id: id === 1 ? null : 1 })),
  recortes_leis_estrutura: [{ recorte_id: free, structure_id: 2 }, { recorte_id: paid, structure_id: 3 }, { recorte_id: sibling, structure_id: 4 }, { recorte_id: sameNode, structure_id: 2 }]
    .map((row) => ({ ...row, lei_id: 14 })),
  legislative_references: [[1, "whole-summary"], [2, "inside-free"], [3, "inside-paid"], [4, "inside-sibling"]]
    .map(([structure_id, content]) => ({ id: content, ordem: String(structure_id), identificacao: content, structure_id,
      legislacao: `<p>${content}</p>`, lei_id: 14, preparado_em: "local", situacao: "preparada" })),
};
rows.scoped_reading_certificates = rows.legislative_references.map((r) => ({
  recorte_id: [null, null, free, paid, sibling][Number(r.structure_id)], reference_id: r.id, lei_id: r.lei_id, structure_id: r.structure_id, format_version: 1, revoked_at: null,
  sha256: scopedReadingDigest({ id: String(r.id), lawId: Number(r.lei_id), structureId: Number(r.structure_id),
    order: String(r.ordem), label: String(r.identificacao), changedAt: null, rawHtml: String(r.legislacao), shippedHtml: String(r.legislacao) }),
}));
const calls: string[] = [];
fixture.provider.mockImplementation(async (token: string) => ({
  data: { user: rows.alunos.some((student) => student.id === token) ? { id: token } : null },
  error: null,
}));
fixture.db.mockReturnValue({
  auth: { getUser: fixture.provider },
  storage: { from: () => { throw new Error("No storage for fixture"); } },
  from(table: string) {
    calls.push(table);
    if (!(table in rows)) throw new Error(`Unexpected request to ${table}`);
    let selected = rows[table].slice();
    const query = {
      select() { return query; }, eq(key: string, value: unknown) { selected = selected.filter((r) => r[key] === value); return query; },
      in(key: string, values: unknown[]) { selected = selected.filter((r) => values.includes(r[key])); return query; },
      not(key: string, _: string, value: unknown) { selected = selected.filter((r) => r[key] !== value); return query; },
      or() { selected = selected.filter((r) => r.situacao !== "arquivada"); return query; },
      order() { return query; },
      range(from: number, to: number) { return Promise.resolve({ data: selected.slice(from, to + 1), error: null }); },
      maybeSingle() { return Promise.resolve({ data: selected[0] ?? null, error: null }); },
      then(callback: (value: { data: Row[]; error: null }) => unknown) { return Promise.resolve({ data: selected, error: null }).then(callback); },
    };
    return query;
  },
});

let server: Server;
let base: string;
beforeAll(async () => {
  server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", base);
      const result = await GET(new Request(url, { headers: req.headers as Record<string, string> }), { params: Promise.resolve({ slug: "cf" }) });
      res.writeHead(result.status, Object.fromEntries(result.headers));
      res.end(await result.text());
    } catch {
      res.writeHead(500).end();
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("No loopback server"));
      base = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
});
afterAll(async () => { if (server?.listening) await new Promise<void>((resolve) => server.close(() => resolve())); });
async function invoke(scopeId: string | null, token?: string, extra = "") {
  return fetch(`${base}/scope?mode=reading${scopeId ? `&recorte_id=${scopeId}` : ""}${extra}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
}

describe("recorte-material em HTTP loopback com autenticação real do aplicativo", () => {
  it("leva aluno assinado e sem compra só ao recorte grátis", async () => {
    calls.length = 0;
    const response = await invoke(free, "free-student", "&structure_id=3");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect((await response.json()).blocks.map((block: Row) => block.id)).toEqual(["inside-free"]);
    expect(calls).not.toContain("liberacoes_leis");
  });

  it("suprime texto editado, revogado ou certificado incompatível antes de entregar HTML", async () => {
    const row = rows.legislative_references[1];
    const pin = rows.scoped_reading_certificates[1];
    const original = row.legislacao;
    try {
      row.legislacao = "<p>Texto alterado sem novo carimbo.</p>";
      expect((await (await invoke(free, "free-student")).json()).blocks).toEqual([]);
      row.legislacao = original;
      pin.revoked_at = "2026-11-23";
      expect((await (await invoke(free, "free-student")).json()).blocks).toEqual([]);
      pin.revoked_at = null;
      pin.structure_id = 3;
      expect((await (await invoke(free, "free-student")).json()).blocks).toEqual([]);
    } finally {
      row.legislacao = original;
      pin.revoked_at = null;
      pin.structure_id = 2;
    }
  });

  it("não transfere uma certificação para outro recorte do mesmo nó", async () => {
    const result = await invoke(sameNode, "free-student");
    expect(result.status).toBe(200);
    expect((await result.json()).blocks).toEqual([]);
  });

  it("dono de recorte exato recebe só esse recorte; compra irmã não amplia", async () => {
    const result = await invoke(paid, "paid-owner");
    expect(result.status).toBe(200);
    expect((await result.json()).blocks.map((block: Row) => block.id)).toEqual(["inside-paid"]);
    expect((await invoke(paid, "sibling-owner")).status).toBe(403);
    expect((await invoke(paid, "free-student")).status).toBe(403);
  });

  it.each([foreign, inactive, pending])("nega scope estrangeiro, inativo ou em breve sem tocar em conteúdo (%s)", async (scopeId) => {
    calls.length = 0;
    const response = await invoke(scopeId, "free-student");
    expect(response.status).toBe(403);
    expect(calls).not.toContain("legislative_references");
  });

  it("nega anônimo/sessão inválida antes da consulta de dados e nunca cai na rota integral", async () => {
    calls.length = 0;
    expect((await invoke(free)).status).toBe(401);
    expect((await invoke(free, "invalid")).status).toBe(401);
    expect((await invoke(null, "free-student")).status).toBe(400);
    expect((await invoke(free, "free-student", "&lei_id=15")).status).toBe(400);
    expect(calls).toEqual([]);
  });
});
