import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { examStates, percentage } from "./dashboard";

describe("painel e edital ativo", () => {
  it("calcula percentual e estados mutuamente exclusivos", () => {
    const states = examStates([
      ...Array.from({ length: 5 }, () => ({ revisao: true, emEstudo: false })),
      ...Array.from({ length: 4 }, () => ({ revisao: false, emEstudo: true })),
      ...Array.from({ length: 3 }, () => ({ revisao: false, emEstudo: false })),
    ]);
    expect(states).toEqual({ revisao: 5, emEstudo: 4, restantes: 3 });
    expect(percentage(states.revisao, 12)).toBe(42);
  });

  it("prioriza revisão sobre estudo e trata edital vazio ou integralmente concluído", () => {
    expect(examStates([{ revisao: true, emEstudo: true }])).toEqual({ revisao: 1, emEstudo: 0, restantes: 0 });
    expect(examStates([])).toEqual({ revisao: 0, emEstudo: 0, restantes: 0 });
    expect(percentage(0, 0)).toBeNull();
    expect(examStates([{ revisao: true, emEstudo: true }, { revisao: true, emEstudo: false }])).toEqual({ revisao: 2, emEstudo: 0, restantes: 0 });
  });

  it("mantém o painel somente leitura e renderiza estados, frase e link do edital", () => {
    const client = readFileSync("components/dashboard-client.tsx", "utf8");
    const route = readFileSync("app/api/dashboard/route.ts", "utf8");
    expect(client).toContain("Monte seu edital de estudo");
    expect(client).toContain("0 leis no edital");
    expect(client).toContain("SegmentedBar");
    expect(client).toContain("No Anki, a constância vale mais que a pressa");
    expect(client).toContain("Ver edital →");
    expect(client).not.toContain("<select");
    expect(client).not.toContain('method: "PATCH"');
    expect(route).not.toContain("PATCH");
  });

  it("mostra o progresso de respostas do edital sem persistência extra", () => {
    const examClient = readFileSync("components/student-exam-client.tsx", "utf8");
    const server = readFileSync("lib/dashboard-server.ts", "utf8");
    expect(examClient).toContain("function ExamProgressBar");
    expect(examClient).toContain("progress.correct + progress.errors + progress.unanswered");
    expect(examClient).not.toContain("campaignStatus");
    expect(examClient).not.toContain('Próximo estudo:');
    expect(server).toContain("const estados = examStates(exam.leis)");
    expect(server).toContain("loadStudentExamSelection(request)");
    expect(server).not.toContain("setDashboardExam");
  });
});
