import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { descendantStructureIds, questionResultNeighbor, sameImportIdentity, wouldCreateStructureCycle } from "./admin-question-management";

const read = (path: string) => readFileSync(path, "utf8");
const server = read("lib/admin-questoes-server.ts");
const route = read("app/api/admin/questoes/route.ts");
const central = read("components/admin/admin-law-questions.tsx");
const structureAdmin = read("components/admin/law-structure-admin.tsx");
const migration = read("supabase/migrations/20260916130000_add_admin_content_deletion.sql");
const bulkMigration = read("supabase/migrations/20260916140000_add_admin_bulk_content_deletion.sql");
const bulkScopeFix = read("supabase/migrations/20260916160000_fix_admin_bulk_content_scope_validation.sql");
const nodes = [{ id: 1, parent_id: null }, { id: 2, parent_id: 1 }, { id: 3, parent_id: 2 }, { id: 4, parent_id: null }];

describe("gestão definitiva de questões e estruturas", () => {
  it("filtra uma estrutura incluindo todos os descendentes", () => expect(descendantStructureIds(nodes, 1)).toEqual([1, 2, 3]));
  it("previne ciclos de estrutura", () => { expect(wouldCreateStructureCycle(nodes, 1, 3)).toBe(true); expect(wouldCreateStructureCycle(nodes, 2, 4)).toBe(false); });
  it("navega entre questões sem sair do resultado", () => { expect(questionResultNeighbor(["a", "b", "c"], "b", -1)).toBe("a"); expect(questionResultNeighbor(["a", "b", "c"], "b", 1)).toBe("c"); expect(questionResultNeighbor(["a"], "a", 1)).toBeNull(); });
  it("usa a identidade de unicidade da importação", () => { expect(sameImportIdentity({ ordem: " 1 ", pergunta: " Q " }, { ordem: "1", pergunta: "Q" })).toBe(true); expect(server).toContain("rejectDuplicateQuestion"); });
  it("protege o fluxo com autenticação administrativa server-side", () => { expect(server).toContain("const user = await obterAdministrador()"); expect(server).toContain("Autenticação administrativa obrigatória"); expect(route).toContain("deleteAdminQuestion"); });
  it("usa uma RPC transacional única e sem arquivamento", () => { expect(migration).toContain("admin_delete_law_content"); expect(migration).toContain("security definer"); expect(migration).toContain("set search_path = ''"); expect(migration).toContain("pg_advisory_xact_lock"); expect(migration).not.toMatch(/admin_archive|admin_restore|archive_batch/); });
  it("apaga campanhas inteiras e limpa progresso antes do conteúdo", () => { expect(migration).toContain("delete from public.campanhas_leis_alunos"); expect(migration).toContain("campanha_ativa_id=null"); expect(migration).toContain("delete from public.questions"); expect(migration).toContain("delete from public.law_structure"); });
  it("exige confirmação para campanhas de outro aluno e para toda exclusão estrutural", () => { expect(migration).toContain("v_has_other_student"); expect(migration).toContain("p_confirmation is distinct from 'EXCLUIR'"); expect(server).toContain('body.confirmation !== "EXCLUIR"'); expect(structureAdmin).toContain("Digite <strong>EXCLUIR</strong> para confirmar a exclusão definitiva"); expect(structureAdmin).toContain("não altera nem apaga baralhos já importados no Anki do seu computador"); });
  it("bloqueia dependências externas sem apagá-las", () => { for (const table of ["legiscast_audios", "legiscast_audio_jobs", "recortes_leis_estrutura"]) expect(migration).toContain(`public.${table}`); expect(migration).toContain("Mova ou desvincule"); expect(structureAdmin).toContain("Exclusão bloqueada"); });
  it("expõe exclusão definitiva nos dois editores", () => { expect(central).toContain("Excluir ${targetLabel} e campanhas afetadas"); expect(structureAdmin).toContain("Excluir estrutura e campanhas afetadas"); expect(`${central}\n${structureAdmin}`).not.toMatch(/action: "restaurar|action: "arquivar|>Lixeira</); });
  it("restringe a RPC ao service_role", () => { expect(migration).toContain("from public,anon,authenticated"); expect(migration).toContain("to service_role"); });
  it("materializa subárvore e questões antes de apagar uma estrutura", () => { expect(bulkMigration).toContain("with recursive descendants"); expect(bulkMigration).toContain("q.structure_id = any(v_structure_ids)"); expect(bulkMigration).toContain("delete from public.questions"); expect(bulkMigration).toContain("delete from public.law_structure"); expect(bulkMigration).toContain("admin_delete_law_content_v2"); });
  it("oferece exclusão em massa limitada à lei, com confirmação obrigatória", () => { expect(server).toContain("bulkQuestionIds"); expect(server).toContain("body.confirmation !== \"EXCLUIR\""); expect(route).toContain('action === "resumo_exclusao_questoes"'); expect(route).toContain('action === "excluir_questoes"'); expect(central).toContain("Excluir questões"); expect(central).toContain("Todas as questões desta lei"); expect(central).toContain("Do resultado atual dos filtros"); });
  it("aceita todas as questões sem estrutura ou IDs do cliente", () => { expect(server).toContain('scope === "all"'); expect(server).toContain('eq("lei_id", current.id).eq("ativo", true)'); expect(bulkScopeFix).toContain("v_old_guard"); expect(bulkScopeFix).toContain("v_new_guard"); expect(bulkScopeFix).toContain("pg_catalog.strpos(v_definition, v_old_guard)"); expect(bulkScopeFix).not.toContain("position(v_old_guard in v_definition)"); expect(bulkScopeFix).toContain("cardinality(p_question_ids), 0) = 0"); });
  it("exige estrutura para o escopo estrutural e IDs para questões específicas", () => { expect(server).toContain('scope === "structure"'); expect(server).toContain("const nodeId = id(body.structure_id)"); expect(server).toContain('scope === "questions"'); expect(server).toContain("Informe uma lista não vazia de questões"); });
});
