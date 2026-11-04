import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const server = readFileSync("lib/student-shortcuts-server.ts", "utf8");
const client = readFileSync("components/student-shortcuts-client.tsx", "utf8");
const migration = readFileSync("supabase/migrations/20261104185509_add_student_shortcut_colors.sql", "utf8");
const categoryColors = readFileSync("supabase/migrations/20261104190000_color_shortcuts_by_law_category.sql", "utf8");

describe("Meus Atalhos", () => {
  it("persiste somente a cor do atalho pessoal e preserva a ordem existente", () => {
    expect(migration).toContain("add column if not exists atalho_cor");
    expect(migration).toContain("default 'azul'");
    expect(migration).toContain("function public.definir_cor_atalho_meu_edital");
    expect(migration).toContain("atalho.edital_id = edital.id");
    expect(migration).toContain("grant execute on function public.definir_cor_atalho_meu_edital");
  });

  it("carrega uma projeção leve, sem campanhas, respostas ou questões", () => {
    expect(server).toContain('rpc("obter_meus_atalhos")');
    expect(server).not.toContain("campanhas_leis_respostas");
    expect(server).not.toContain("progresso_leis_alunos");
    expect(migration).toContain("function public.obter_meus_atalhos()");
    expect(migration).not.toContain("campanhas_leis_respostas");
    expect(migration).not.toContain("questions");
    expect(server).toContain('select("id,nome,nome_exibicao")');
    expect(server).toContain("scope.nome_exibicao.trim()");
    expect(server).toContain("withFullScopeNames");
  });

  it("preserva recortes, desabilita prefetch e informa bloqueio sem apagar a cor", () => {
    expect(client).toContain("recorte_id=${encodeURIComponent(shortcut.recorteId)}");
    expect(client).toContain("prefetch={false}");
    expect(client).toContain("🔒");
    expect(client).toContain("confirmReplace: Boolean(existing)");
    expect(client).toContain('updatePersonal("rename", { nome: name })');
    expect(client).toContain("Sugestões de organização:");
    expect(client).toContain('aria-label="Selecionar um edital sugerido"');
    expect(client).toContain("legisflashcards:atalhos-organizacao");
    expect(client).toContain("window.localStorage.setItem(selectedOrganizationKey, id)");
    expect(client).toContain("border-2 border-dashed border-current");
    expect(client).toContain('touchAction: "none"');
    expect(client).toContain("setPointerCapture(event.pointerId)");
    expect(client).toContain("🗑 Remover");
    expect(client).toContain("🎨 Cores");
    expect(client).toContain("translate(${offset.x}px, ${offset.y}px)");
  });

  it("usa a categoria cadastrada como cor inicial e nas seleções prontas", () => {
    expect(categoryColors).toContain("function public.cor_atalho_por_categoria");
    expect(categoryColors).toContain("'verde'");
    expect(categoryColors).toContain("'amarelo'");
    expect(categoryColors).toContain("'laranja'");
    expect(categoryColors).toContain("'azul'");
    expect(categoryColors).toContain("'vermelho'");
    expect(categoryColors).toContain("'cor', public.cor_atalho_por_categoria(lei.categoria)");
    expect(categoryColors).toContain("atalho_cor)");
    expect(client).toContain('laranja: "from-orange-100');
    expect(client).toContain('vermelho: "from-red-100');
  });
});
