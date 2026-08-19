import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { lawDisplayName, nextQuestionOrder, parseQuestionDraft } from "./admin-questoes";

const base = { pergunta: "A Constituição é a lei fundamental?", resposta: "Certo", ordem: 1 };

describe("administração de Legis Questões", () => {
  it("valida uma questão completa e normaliza campos opcionais", () => {
    expect(parseQuestionDraft({ ...base, titulo: " CF ", capitulo: " ", justificativa: "  Explicação.  " })).toMatchObject({
      titulo: "CF", capitulo: null, justificativa: "Explicação.", resposta: "Certo", ordem: 1,
    });
  });

  it("rejeita resposta, pergunta ou ordem inválidas", () => {
    expect(() => parseQuestionDraft({ ...base, resposta: "Talvez" })).toThrow("Certo ou Errado");
    expect(() => parseQuestionDraft({ ...base, pergunta: " " })).toThrow("Pergunta é obrigatório");
    expect(() => parseQuestionDraft({ ...base, ordem: -1 })).toThrow("Ordem inválido");
  });

  it("prepara a próxima ordem e a identificação da lei principal", () => {
    expect(nextQuestionOrder(7)).toBe(8);
    expect(lawDisplayName({ codigo: "L6513/MA", titulo: "Lei Estadual" })).toBe("L6513/MA — Lei Estadual");
    expect(lawDisplayName({ titulo: "Constituição Federal", nome_curto: "CF" })).toBe("CF — Constituição Federal");
  });

  it("mantém autenticação administrativa e separa os dois Supabases no servidor", () => {
    const server = readFileSync("lib/admin-questoes-server.ts", "utf8");
    const route = readFileSync("app/api/admin/questoes/route.ts", "utf8");
    expect(server).toContain('import "server-only"');
    expect(server).toContain("await obterAdministrador()");
    expect(server).toContain('getSupabaseServerClient()');
    expect(server).toContain('supabaseQuestoes.from("laws")');
    expect(server).toContain("ensureQuestionLaw(law)");
    expect(server).toContain('.eq("law_id", questionLaw.id)');
    expect(server).toContain("update({ ativo: false })");
    expect(route).toContain("createAdminQuestion");
    expect(route).toContain("deactivateAdminQuestion");
  });

  it("prepara estrutura hierárquica sem expor o banco de questões ao cliente", () => {
    const migration = readFileSync("supabase/questoes/migrations/20260818150000_create_law_structure.sql", "utf8");
    const server = readFileSync("lib/admin-questoes-server.ts", "utf8");
    const deck = readFileSync("components/legis-questoes-client.tsx", "utf8");
    const study = readFileSync("app/api/questoes/[slug]/estudar/route.ts", "utf8");
    expect(migration).toContain("create table if not exists public.law_structure");
    expect(migration).toContain("structure_id bigint null references public.law_structure(id)");
    expect(migration).toContain("enable row level security");
    expect(server).toContain("validateQuestionStructure");
    expect(server).toContain("createStructureNode");
    expect(deck).toContain("buildStoredTree");
    expect(study).toContain("descendantStructureIds");
  });

  it("oferece o fluxo visual de análise e confirmação do TXT sem alterar o servidor", () => {
    const panel = readFileSync("components/admin/admin-questoes.tsx", "utf8");
    expect(panel).toContain('type="file" accept=".txt,text/plain"');
    expect(panel).toContain("await file.text()");
    expect(panel).toContain('action:"previsualizar_anki"');
    expect(panel).toContain('action:"importar_anki"');
    expect(panel).toContain("Existem problemas que precisam ser corrigidos antes da importação.");
    expect(panel).toContain("Importar outro TXT");
    expect(panel).toContain("await reload()");
    expect(panel).toContain("Duplicadas:");
  });
});
