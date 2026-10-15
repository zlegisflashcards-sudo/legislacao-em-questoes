import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const service = readFileSync("lib/question-legisbot-links.ts", "utf8");
const route = readFileSync("app/api/admin/artigos/legisbot-vinculos/route.ts", "utf8");
const migration = readFileSync("supabase/migrations/20261014173000_add_question_legisbot_links.sql", "utf8");
const questions = readFileSync("components/admin/article-questions.tsx", "utf8");
const conflicts = readFileSync("lib/admin-article-conflicts-server.ts", "utf8");

describe("vinculação de questões ao LegisBot", () => {
  it("mantém o vínculo em tabela opcional, sem alterar a Ordem da questão", () => {
    expect(migration).toContain("create table if not exists public.question_legisbot_links");
    expect(migration).toContain("question_id uuid primary key references public.questions");
    expect(migration).toContain("legisbot_id bigint not null references public.legisbot_comentarios");
    expect(migration).not.toMatch(/alter table public\.questions[\s\S]*ordem/i);
  });

  it("restringe o vínculo manual à mesma lei e protege a tabela por RLS", () => {
    expect(migration).toContain("question_legisbot_links_same_law");
    expect(migration).toContain("lower(question_slug) <> lower(bot_slug)");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("grant select, insert, update, delete on public.question_legisbot_links to service_role");
  });

  it("prioriza vínculo manual e reutiliza a hierarquia oficial quando ele não existir", () => {
    expect(service).toContain("legisBotOrderCandidates");
    expect(service).toContain('status: "vinculado"');
    expect(service).toContain('status: "hierarquia"');
    expect(service).toContain('status: "sem_legisbot"');
    expect(service).toContain("if (manual && available(manual))");
  });

  it("permite busca e vínculo em lote, limitados no servidor", () => {
    expect(service).toContain("pageSize = Math.min(50");
    expect(service).toContain("ids.length > 100");
    expect(route).toContain("export async function GET");
    expect(route).toContain("export async function PUT");
    expect(questions).toContain("Vincular selecionadas");
    expect(questions).toContain("Remover vínculo");
  });

  it("mantém pendências do LegisBot fora da lista de conflitos das questões", () => {
    expect(conflicts).not.toContain('type === "comentario_sem_analise"');
    expect(conflicts).not.toContain('"Comentário sem análise"');
  });
});
