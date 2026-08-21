import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";

const state = vi.hoisted(() => ({ administrator: { id: "__ADMIN_TEST__" } as { id: string } | null }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin-auth", () => ({ obterAdministrador: vi.fn(async () => state.administrator) }));

import { buildLawApkg } from "./anki-apkg-export";
import { importApkg, previewApkgImport } from "./admin-questoes-server";
import { GET } from "@/app/api/admin/questoes/route";

const enabled = process.env.RUN_MAIN_ADMIN_INTEGRATION === "1";
const temporaryOrder = "9999.C.00.01";
const temporaryQuestion = "<strong>__ADMIN_TEST_APKG__</strong><br>linha 2";
const temporaryStructure = "Título __ADMIN_TEST_APKG__";
function clients() {
  const main = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const legacy = createClient(process.env.QUESTOES_SUPABASE_URL!, process.env.QUESTOES_SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
  return { main, legacy };
}
const count = async (client: any, table: "questions" | "law_structure") => {
  const result = await client.from(table).select("*", { count: "exact", head: true });
  if (result.error) throw result.error;
  return result.count ?? 0;
};

async function cleanup() {
  const { main } = clients();
  const law = await main.from("leis").select("id").eq("slug", "l9455").maybeSingle();
  if (!law.data) return;
  const questions = await main.from("questions").select("id").eq("lei_id", law.data.id).eq("ordem", temporaryOrder).eq("pergunta", temporaryQuestion);
  if (questions.data?.length) await main.from("questions").delete().in("id", questions.data.map((item) => item.id));
  const structure = await main.from("law_structure").select("id,parent_id").eq("lei_id", law.data.id).like("nome", "%__ADMIN_TEST_APKG__%");
  const ids = structure.data?.map((item) => item.id) ?? [];
  if (ids.length) await main.from("law_structure").delete().in("id", ids.reverse());
}

const integration = enabled ? describe : describe.skip;
integration("integração controlada do Admin no schema principal", () => {
  afterEach(async () => { await cleanup(); state.administrator = { id: "__ADMIN_TEST__" }; });

  it("pré-visualiza, importa e deduplica APKG exclusivamente no principal", async () => {
    const { main, legacy } = clients();
    const before = { mainQuestions: await count(main, "questions"), mainStructure: await count(main, "law_structure"), legacyQuestions: await count(legacy, "questions"), legacyStructure: await count(legacy, "law_structure") };
    expect(before).toEqual({ mainQuestions: 872, mainStructure: 75, legacyQuestions: 872, legacyStructure: 75 });
    const exported = await buildLawApkg({ slug: "l9455", titulo: "Lei nº 9.455 - Crimes de Tortura" }, [{ id: "__ADMIN_TEST_APKG__-1", structure_id: 1, pergunta: temporaryQuestion, resposta: "Certo", justificativa: "<strong>Justificativa APKG</strong><br>linha 2", assunto: "__ADMIN_TEST_APKG__ assunto", legislacao: "<strong>Legislação APKG</strong><br>linha 2", ordem: temporaryOrder, slug: "l9455" }], [{ id: 1, parent_id: null, nome: temporaryStructure }]);
    const bytes = exported.bytes.buffer.slice(exported.bytes.byteOffset, exported.bytes.byteOffset + exported.bytes.byteLength) as ArrayBuffer;
    const file = new File([bytes], "__ADMIN_TEST_APKG__.apkg", { type: "application/octet-stream" });
    const preview = await previewApkgImport("l9455", file);
    expect(preview.summary).toMatchObject({ novas: 1, duplicadas: 0, erros: 0 });
    expect(preview.items[0]).toMatchObject({ ordem: temporaryOrder, pergunta: temporaryQuestion, status: "nova" });
    expect(await count(main, "questions")).toBe(before.mainQuestions);
    expect(await count(main, "law_structure")).toBe(before.mainStructure);
    const imported = await importApkg({ lawSlug: "l9455", file });
    expect(imported).toMatchObject({ importadas: 1, duplicadas: 0, erros: 0 });
    const law = await main.from("leis").select("id").eq("slug", "l9455").single();
    expect(law.data).not.toBeNull();
    const leiId = law.data!.id;
    const inserted = await main.from("questions").select("lei_id,structure_id,ordem,pergunta,ativo").eq("lei_id", leiId).eq("ordem", temporaryOrder).eq("pergunta", temporaryQuestion).single();
    expect(inserted.data).toMatchObject({ lei_id: leiId, ordem: temporaryOrder, pergunta: temporaryQuestion, ativo: true });
    expect(inserted.data?.structure_id).not.toBeNull();
    const reimport = await importApkg({ lawSlug: "l9455", file });
    expect(reimport).toMatchObject({ importadas: 0, duplicadas: 1, erros: 0 });
    expect(await count(legacy, "questions")).toBe(before.legacyQuestions);
    expect(await count(legacy, "law_structure")).toBe(before.legacyStructure);
  }, 30_000);

  it("percorre a rota HTTP administrativa e bloqueia ausência de privilégio", async () => {
    state.administrator = { id: "admin" };
    const allowed = await GET(new Request("http://local.test/api/admin/questoes"));
    expect(allowed.status).toBe(200);
    const body = await allowed.json();
    expect(Array.isArray(body.laws)).toBe(true);
    state.administrator = null;
    const noSession = await GET(new Request("http://local.test/api/admin/questoes"));
    expect(noSession.status).toBe(401);
  });
});
