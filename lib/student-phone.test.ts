import { describe, expect, it } from "vitest";
import { normalizeStudentPhone } from "./student-phone";

describe("telefone do aluno", () => {
  it("aceita formatos brasileiros sem exigir +55", () => {
    expect(normalizeStudentPhone("(11) 99999-9999")).toBe("+5511999999999");
    expect(normalizeStudentPhone("+55 11 99999-9999")).toBe("+5511999999999");
  });
  it("rejeita valores obviamente inválidos", () => expect(normalizeStudentPhone("123")).toBeNull());
});
