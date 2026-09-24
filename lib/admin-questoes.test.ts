import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { lawDisplayName, nextQuestionOrder, parseQuestionDraft } from "./admin-questoes";

const base = { pergunta: "A Constituição é a lei fundamental?", resposta: "Certo", ordem: 1 };

describe("administração de Legis Questões", () => {
  it("valida uma questão completa e normaliza campos opcionais", () => {
    expect(parseQuestionDraft({ ...base, titulo: " CF ", capitulo: " ", justificativa: "  Explicação.  " })).toMatchObject({
      titulo: "CF", capitulo: null, justificativa: "Explicação.", resposta: "Certo", ordem: "1",
    });
  });

  it("rejeita resposta, pergunta ou ordem inválidas", () => {
    expect(() => parseQuestionDraft({ ...base, resposta: "Talvez" })).toThrow("Certo ou Errado");
    expect(() => parseQuestionDraft({ ...base, pergunta: " " })).toThrow("Pergunta é obrigatório");
    expect(() => parseQuestionDraft({ ...base, ordem: -1 })).toThrow("Ordem inválido");
  });

  it("preserva ordem textual de questões importadas", () => {
    expect(parseQuestionDraft({ ...base, ordem: "0010.0.00.14" }).ordem).toBe("0010.0.00.14");
  });

  it("prepara a próxima ordem e a identificação da lei principal", () => {
    expect(nextQuestionOrder(7)).toBe(8);
    expect(lawDisplayName({ codigo: "L6513/MA", titulo: "Lei Estadual" })).toBe("L6513/MA — Lei Estadual");
    expect(lawDisplayName({ titulo: "Constituição Federal", nome_curto: "CF" })).toBe("CF — Constituição Federal");
  });

  it("mantém autenticação administrativa e usa exclusivamente o schema principal", () => {
    const server = readFileSync("lib/admin-questoes-server.ts", "utf8");
    const route = readFileSync("app/api/admin/questoes/route.ts", "utf8");
    expect(server).toContain('import "server-only"');
    expect(server).toContain("await obterAdministrador()");
    expect(server).toContain('getSupabaseServerClient()');
    expect(server).toContain('.from("leis")');
    expect(server).toContain('.from("questions")');
    expect(server).toContain('.from("law_structure")');
    expect(server).toContain('.from("recortes_leis")');
    expect(server).toContain('.from("recortes_leis_estrutura")');
    expect(server).not.toContain('recortes_leis_estrutura(structure_id)');
    expect(server).toContain('.eq("lei_id", current.id)');
    expect(server).not.toContain("getSupabaseQuestoesClient");
    expect(server).toContain("update({ ativo: false })");
    expect(route).toContain("createAdminQuestion");
    expect(route).toContain("deactivateAdminQuestion");
    expect(route).toContain("reactivateAdminQuestion");
  });

  it("protege a edição rápida do player e mantém os vínculos estruturais fora dela", () => {
    const server = readFileSync("lib/admin-questoes-server.ts", "utf8");
    const route = readFileSync("app/api/admin/questoes/route.ts", "utf8");
    const player = readFileSync("components/legis-questoes-study-client.tsx", "utf8");
    expect(server).toContain("export async function updateQuickAdminQuestion");
    expect(server).toContain("await requireAdmin()");
    expect(server).toContain('"A edição rápida não permite alterar a estrutura da questão."');
    expect(server).toContain("return updateAdminQuestion({");
    expect(route).toContain('action === "atualizar_rapido"');
    expect(player).toContain('fetch("/api/admin/session"');
    expect(player).toContain("✏️ Editar questão");
    expect(player).toContain("Abrir na Central da Lei ↗");
    expect(player).not.toContain(">Editar aqui<");
  });

  it("prepara estrutura hierárquica sem expor o banco de questões ao cliente", () => {
    const migration = readFileSync("supabase/questoes/migrations/20260818150000_create_law_structure.sql", "utf8");
    const server = readFileSync("lib/admin-questoes-server.ts", "utf8");
    const deck = readFileSync("components/legis-questoes-client.tsx", "utf8");
    const study = readFileSync("app/api/questoes/[slug]/estudar/route.ts", "utf8");
    expect(migration).toContain("create table if not exists public.law_structure");
    expect(migration).toContain("structure_id bigint null references public.law_structure(id)");
    expect(migration).toContain("enable row level security");
    expect(server).toContain("validateStructure");
    expect(server).toContain("createStructureNode");
    expect(deck).toContain("buildStoredTree");
    expect(study).toContain("descendantStructureIds");
  });

  it("oferece o fluxo visual de análise e confirmação do TXT sem alterar o servidor", () => {
    const panel = readFileSync("components/admin/admin-question-anki-tools.tsx", "utf8");
    expect(panel).toContain('type="file" accept=".txt,text/plain"');
    expect(panel).toContain("file.text().then");
    expect(panel).toContain('action: "previsualizar_anki"');
    expect(panel).toContain('action: "importar_anki"');
    expect(panel).toContain("Existem problemas que precisam ser corrigidos antes da importação.");
    expect(panel).toContain("Destinos estruturais");
    expect(panel).toContain("await onImported?.()");
    expect(panel).toContain("Duplicadas:");
  });

  it("oferece prévia APKG sem rota de persistência", () => {
    const server = readFileSync("lib/admin-questoes-server.ts", "utf8");
    const route = readFileSync("app/api/admin/questoes/route.ts", "utf8");
    const panel = readFileSync("components/admin/admin-question-anki-tools.tsx", "utf8");
    expect(server).toContain("export async function previewApkgImport");
    expect(server).toContain("parseLegisApkg");
    expect(route).toContain('action !== "previsualizar_apkg" && action !== "importar_apkg"');
    expect(panel).toContain('accept=".apkg,application/octet-stream"');
    expect(panel).toContain("O arquivo não é armazenado.");
  });

  it("oferece a exportação APKG somente pelo painel administrativo protegido", () => {
    const panel = readFileSync("components/admin/admin-question-anki-tools.tsx", "utf8");
    const route = readFileSync("app/api/admin/questoes/exportar-apkg/route.ts", "utf8");
    expect(panel).toContain("Exportar APKG");
    expect(panel).toContain("/api/admin/questoes/exportar-apkg?slug=");
    expect(route).toContain("exportLawApkg");
    expect(route).toContain('export const runtime = "nodejs"');
  });

  it("confirma APKG pela mesma persistência compartilhada do TXT", () => {
    const server = readFileSync("lib/admin-questoes-server.ts", "utf8");
    const route = readFileSync("app/api/admin/questoes/route.ts", "utf8");
    const panel = readFileSync("components/admin/admin-question-anki-tools.tsx", "utf8");
    expect(server).toContain("async function persist(");
    expect(server).toContain("return persist(slug(body.law_slug), parsed.rows, data, mappings)");
    expect(server).toContain("return persist(slug(body.lawSlug), parsed.rows, data, mappings, parsed.unrecognizedModels");
    expect(route).toContain('action !== "importar_apkg"');
    expect(panel).toContain('action", "importar_apkg"');
    expect(panel).toContain("notas ignoradas por modelo");
  });

  it("mantém a rota APKG no Node e sql.js fora do bundle", () => {
    const config = readFileSync("next.config.ts", "utf8");
    const route = readFileSync("app/api/admin/questoes/route.ts", "utf8");
    const parser = readFileSync("lib/anki-apkg-import.ts", "utf8");
    const exporter = readFileSync("lib/anki-apkg-export.ts", "utf8");
    expect(config).toContain('serverExternalPackages: ["sql.js", "ankipack"]');
    expect(config).toContain('"/api/aluno/estudar/lei/[slug]/anki/download"');
    expect(config).toContain('"./node_modules/.pnpm/sql.js@1.14.2/node_modules/sql.js/dist/sql-wasm.wasm"');
    expect(exporter).toContain('"sql.js@1.14.2", "node_modules", "sql.js", "dist", "sql-wasm.wasm"');
    expect(exporter).toContain('locateFile: (file)');
    expect(route).toContain('export const runtime = "nodejs"');
    expect(parser).toContain('await import("sql.js")');
    expect(parser).not.toContain('import initSqlJs from "sql.js"');
  });

  it("mantém o contrato APKG completo mesmo sem coleções opcionais", () => {
    const server = readFileSync("lib/admin-questoes-server.ts", "utf8");
    const preview = server.slice(server.indexOf("export async function previewApkgImport"), server.indexOf("async function persist"));
    expect(preview).toContain("unrecognizedModels: parsed.unrecognizedModels ?? []");
    expect(preview).toContain("media: parsed.media ?? []");
    expect(preview).toContain("samples: parsed.rows.slice(0, 5)");
  });

  it("renderiza detalhes de erros impeditivos nas prévias TXT e APKG", () => {
    const panel = readFileSync("components/admin/admin-question-anki-tools.tsx", "utf8");
    expect(panel).toContain('<ImportErrors errors={preview.errors} expectedCount={preview.summary.erros} />');
    expect(panel).toContain("A prévia informou {expectedCount} erro(s) impeditivo(s)");
    expect(panel).toContain("Erros impeditivos");
  });

  it("permite editar questões importadas com estrutura e HTML no formulário", () => {
    const panel = readFileSync("components/admin/admin-law-questions.tsx", "utf8");
    const sharedEditor = readFileSync("components/admin/admin-question-editor.tsx", "utf8");
    expect(panel).toContain("async function editQuestion(id: string)");
    expect(panel).toContain("const next = adminQuestionFormFrom(body.question)");
    expect(panel).toContain('action: savedId ? "atualizar" : "criar"');
    expect(panel).toContain("<AdminQuestionEditor");
    expect(sharedEditor).toContain('input required inputMode="decimal" value={value.ordem}');
    expect(panel).toContain("onClick={() => void editQuestion(question.id)}");
  });

  it("edita cada campo rico visualmente sem sanitizar ou reserializar o HTML armazenado", () => {
    const panel = readFileSync("components/admin/admin-question-editor.tsx", "utf8");
    const editor = readFileSync("components/admin/question-rich-editor.tsx", "utf8");
    expect(panel).toContain('<QuestionRichEditor label="Pergunta"');
    expect(panel).toContain('<QuestionRichEditor label="Justificativa"');
    expect(panel).toContain('<QuestionRichEditor label="Legislação"');
    expect(editor).toContain("contentEditable");
    expect(editor).toContain("&lt;&gt;");
    expect(editor).toContain("visualRef.current.innerHTML = value");
    expect(editor).not.toContain("sanitizeLegisQuestoesHtml");
  });

  it("bloqueia TXT de outra legislação antes de planejar ou persistir questões", () => {
    const server = readFileSync("lib/admin-questoes-server.ts", "utf8");
    const preview = server.slice(server.indexOf("async function preview("), server.indexOf("export async function previewAnkiImport"));
    expect(preview.indexOf("validateImportSlug(parsed.rows, current.slug)")).toBeLessThan(preview.indexOf("planQuestionDeckStructure(rows, nodes, mappings)"));
  });

  it("aplica o slug efetivo no servidor tanto na prévia quanto na importação", () => {
    const server = readFileSync("lib/admin-questoes-server.ts", "utf8");
    expect(server).toContain("withSlug(parsed.rows, current.slug)");
    expect(server).toContain("const duplicate = known.has(`${row.slug}");
    expect(server).toContain("slug: row.slug");
  });

  it("planeja a estrutura na prévia e só a cria na confirmação", () => {
    const server = readFileSync("lib/admin-questoes-server.ts", "utf8");
    const panel = readFileSync("components/admin/admin-question-anki-tools.tsx", "utf8");
    const decks = readFileSync("components/legis-questoes-client.tsx", "utf8");
    expect(server).toContain("planQuestionDeckStructure(rows, nodes, mappings)");
    expect(server).toContain('db().from("law_structure").insert');
    expect(panel).toContain("Destinos estruturais");
    expect(panel).toContain("será criada");
    expect(decks).toContain("compareQuestionStructureNames");
  });

  it("oferece prévia e confirmação da estrutura TXT somente para a lei da URL", () => {
    const server = readFileSync("lib/admin-questoes-server.ts", "utf8");
    const route = readFileSync("app/api/admin/questoes/route.ts", "utf8");
    const panel = readFileSync("components/admin/law-structure-admin.tsx", "utf8");
    expect(route).toContain('action === "previsualizar_estrutura_txt"');
    expect(route).toContain('action === "importar_estrutura_txt"');
    expect(server).toContain("parseQuestionStructureTxt(input)");
    expect(server).toContain("planQuestionDeckStructure(parsed.rows, existing)");
    expect(server).toContain("lei_id: prepared.current.id");
    expect(server).toContain('.eq("lei_id", prepared.current.id).in("id", insertedIds)');
    expect(panel).toContain("Importar estrutura por TXT");
    expect(panel).toContain("Gerar prévia");
    expect(panel).toContain("Confirmar importação de");
  });

  it("mantém o importador Anki no mesmo planejador hierárquico", () => {
    const server = readFileSync("lib/admin-questoes-server.ts", "utf8");
    const ankiPreview = server.slice(server.indexOf("async function preview("), server.indexOf("export async function previewAnkiImport"));
    const ankiPersist = server.slice(server.indexOf("async function persist("), server.indexOf("export async function importAnkiTxt"));
    expect(ankiPreview).toContain("planQuestionDeckStructure(rows, nodes, mappings)");
    expect(ankiPersist).toContain("planQuestionDeckStructure(newRows, before, mappings)");
  });

  it("remove estrutura com suas questões e oferece confirmação administrativa", () => {
    const server = readFileSync("lib/admin-questoes-server.ts", "utf8");
    const route = readFileSync("app/api/admin/questoes/route.ts", "utf8");
    const panel = readFileSync("components/admin/law-structure-admin.tsx", "utf8");
    expect(server).toContain("structureDeletionSummary");
    expect(server).toContain('rpc("admin_delete_law_content_v3"');
    expect(server).toContain("structureDeletionSummary");
    expect(route).toContain('action === "resumo_exclusao_estrutura"');
    expect(route).toContain('action === "excluir_estrutura"');
    expect(panel).toContain('action: "resumo_exclusao_estrutura"');
    expect(panel).toContain('action: "excluir_estrutura"');
    expect(panel).toContain("questão(ões)");
    expect(panel).toContain("Excluir estrutura e campanhas afetadas");
  });

  it("mantém a criação inline e a confirmação de exclusão no layout de questões selecionado", () => {
    const server = readFileSync("lib/admin-questoes-server.ts", "utf8");
    const panel = readFileSync("components/admin/law-structure-admin.tsx", "utf8");
    expect(server).toContain("validQuestionStructureParent(nodeType");
    expect(panel).not.toContain("window.prompt");
    expect(panel).toContain("function startCreation");
    expect(panel).toContain("function saveCreation");
    expect(panel).toContain('event.key === "Enter"');
    expect(panel).toContain('event.key === "Escape"');
    expect(panel).toContain("parent_id: pending.parentId");
    expect(panel).toContain("if (!pending || !nome || saving || creatingRequest.current) return");
    expect(panel).toContain("creatingRequest.current");
    expect(panel).toContain("await onReload(); setCreating(null)");
    expect(panel).toContain("deleting ? <DeletionDialog");
    expect(panel).toContain("confirmDelete");
  });

  it("edita nome, posição e PDF sem modificar identidade, hierarquia ou tipo", () => {
    const server = readFileSync("lib/admin-questoes-server.ts", "utf8");
    const route = readFileSync("app/api/admin/questoes/route.ts", "utf8");
    const update = server.slice(server.indexOf("export async function updateStructureNode"), server.indexOf("export async function deactivateStructureNode"));
    expect(update).toContain('const patch: { nome: string; ordem?: number; pdf_page?: number | null }');
    expect(update).toContain(".update(patch)");
    expect(update).not.toContain("parent_id:");
    expect(update).not.toContain("tipo:");
    expect(update).toContain('.eq("id", id(body.id))');
    expect(update).toContain('.eq("lei_id", current.id)');
    expect(route).toContain('action === "atualizar_estrutura"');
  });

  it("oferece edição inline genérica para todos os níveis estruturais", () => {
    const panel = readFileSync("components/admin/law-structure-admin.tsx", "utf8");
    expect(panel).toContain('type Edition = { id: number; nome: string; ordem: string; pdfPage: string }');
    expect(panel).toContain("async function saveEdition()");
    expect(panel).toContain('action: "atualizar_estrutura"');
    expect(panel).toContain("changeEdition({ id: node.id, nome: node.nome");
    expect(panel).toContain("autoFocus");
    expect(panel).toContain("current.nome.trim()");
    expect(panel).toContain("editingRequest.current");
    expect(panel).toContain("await onReload(); setEditing(null)");
    expect(panel).toContain("labels[node.tipo]");
    expect(panel).toContain("changeEdition(null)");
    expect(panel).toContain("Criar primeira Parte");
    expect(panel).toContain("creatableQuestionStructureTypes");
  });
});
