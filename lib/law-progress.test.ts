import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lawStudyProgressMessage, nextLawStudyProgress, type LawStudyProgress } from "./law-study";

const migration = readFileSync("supabase/migrations/20260807002500_create_student_law_progress.sql", "utf8");
const server = readFileSync("lib/law-study-server.ts", "utf8");
const route = readFileSync("app/api/aluno/estudar/lei/[slug]/progresso/route.ts", "utf8");
const client = readFileSync("components/law-study-page-client.tsx", "utf8");

describe("consistência do progresso da lei", () => {
  const initial: LawStudyProgress = { inStudy: false, questionsFinished: false };

  it("parte de false/false e marca Lei em estudo como true/false", () => {
    expect(initial).toEqual({ inStudy: false, questionsFinished: false });
    expect(nextLawStudyProgress(initial, "inStudy", true)).toEqual({ inStudy: true, questionsFinished: false });
  });

  it("marcar conclusão também marca Lei em estudo", () => {
    expect(nextLawStudyProgress(initial, "questionsFinished", true)).toEqual({ inStudy: true, questionsFinished: true });
  });

  it("desmarcar conclusão preserva Lei em estudo", () => {
    expect(nextLawStudyProgress({ inStudy: true, questionsFinished: true }, "questionsFinished", false)).toEqual({ inStudy: true, questionsFinished: false });
  });

  it("desmarcar Lei em estudo também desmarca a conclusão", () => {
    expect(nextLawStudyProgress({ inStudy: true, questionsFinished: true }, "inStudy", false)).toEqual({ inStudy: false, questionsFinished: false });
  });
});

describe("mensagem dinâmica do progresso", () => {
  it("não mostra mensagem adicional antes de iniciar", () => {
    expect(lawStudyProgressMessage({ inStudy: false, questionsFinished: false })).toBeNull();
  });

  it("orienta a continuar quando a lei está em estudo", () => {
    expect(lawStudyProgressMessage({ inStudy: true, questionsFinished: false })).toBe(
      "Continue avançando nas questões desta lei até concluir o primeiro ciclo de estudo.",
    );
  });

  it("prioriza a conclusão quando ambas as marcações estão ativas", () => {
    expect(lawStudyProgressMessage({ inStudy: true, questionsFinished: true })).toBe(
      "Primeiro ciclo concluído! Agora mantenha em dia as revisões programadas que aparecerão no seu App de Questões.",
    );
  });
});

describe("persistência privada aluno × lei", () => {
  it("cria a estrutura mínima com unicidade, FKs e estado coerente", () => {
    for (const expected of [
      "create table if not exists public.progresso_leis_alunos",
      "aluno_id uuid not null",
      "lei_id bigint not null",
      "em_estudo boolean not null default false",
      "questoes_finalizadas boolean not null default false",
      "created_at timestamptz not null",
      "updated_at timestamptz not null",
      "unique (aluno_id, lei_id)",
      "check (not questoes_finalizadas or em_estudo)",
    ]) expect(migration).toContain(expected);
    expect(migration).toContain("references public.alunos(id)");
    expect(migration).toContain("references public.leis(id)");
  });

  it("habilita RLS sem conceder acesso direto ao aluno", () => {
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("revoke all on public.progresso_leis_alunos from public, anon, authenticated, service_role");
    expect(migration).toContain("grant select, insert, update, delete on public.progresso_leis_alunos to service_role");
    expect(migration).not.toMatch(/create policy/i);
  });

  it("trata ausência de registro como false/false", () => {
    expect(server).toContain("record(progressResult.data)?.em_estudo === true");
    expect(server).toContain("record(progressResult.data)?.questoes_finalizadas === true");
  });

  it("rejeita false/true no servidor e remove o registro em false/false", () => {
    expect(server).toContain("if (row.questionsFinished && !row.inStudy)");
    expect(server).toContain("Estado de progresso incoerente.");
    expect(server).toContain("if (!next.inStudy && !next.questionsFinished)");
    expect(server).toContain('.from("progresso_leis_alunos").delete().eq("aluno_id", studentId).eq("lei_id", lawId)');
  });

  it("valida sessão e liberação ativa antes de ler ou alterar", () => {
    expect(server).toContain("auth.getUser(token)");
    expect(server).toContain('.from("liberacoes_leis").select("id")');
    expect(server).toContain('.eq("status", "ativo")');
    expect(server.indexOf("authorizeLawStudy(request, slug)", server.indexOf("updateLawProgress"))).toBeLessThan(server.indexOf('.from("progresso_leis_alunos").upsert'));
  });

  it("não aceita aluno ou lei do corpo e sempre grava os IDs autorizados", () => {
    expect(server).toContain('Object.keys(row).sort().join(",") !== "inStudy,questionsFinished"');
    expect(server).toContain("aluno_id: studentId");
    expect(server).toContain("lei_id: lawId");
    expect(route).toContain("export async function PATCH");
    expect(route).toContain('startsWith("application/json")');
  });
});

describe("checkboxes da lei", () => {
  it("renderiza as duas marcações e persiste por PATCH autenticado", () => {
    expect(client).toContain("Progresso nesta lei");
    expect(client).toContain("Lei em estudo");
    expect(client).toContain("Finalizei todas as questões da lei");
    expect(client).toContain('method: "PATCH"');
    expect(client).toContain("nextLawStudyProgress");
    expect(client).toContain("Authorization: `Bearer ${token}`");
    expect(client).not.toContain("localStorage");
  });
});
