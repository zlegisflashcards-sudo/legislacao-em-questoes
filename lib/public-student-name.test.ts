import { describe, expect, it } from "vitest";
import { publicStudentName } from "./public-student-name";

describe("nome público de competição", () => {
  it("preserva o nome público escolhido", () => expect(publicStudentName({ nome_publico: "Capitão Silva", nome: "João Pedro da Silva" })).toBe("Capitão Silva"));
  it("usa o primeiro nome quando o perfil tem o fallback técnico", () => expect(publicStudentName({ nome_publico: "estudante123456", nome: "João Pedro da Silva" })).toBe("João"));
  it("mantém um fallback seguro sem nome completo", () => expect(publicStudentName({ nome_publico: null, nome: null })).toBe("Jogador Legis"));
});
