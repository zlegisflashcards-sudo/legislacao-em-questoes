import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("destaques em lote da Lei Interativa", () => {
  it("limita os ids, confere a lei e delega a posse ao RLS do aluno", () => {
    const route = readFileSync("app/api/legisbot/[slug]/destaques/route.ts", "utf8");
    expect(route).toContain("slice(0, 30)");
    expect(route).toContain('.from("legislative_references").select("id").eq("slug", slug).in("id", requested)');
    expect(route).toContain('.from("legisbot_destaques_usuario")');
    expect(route).toContain('.in("reference_id", ids)');
    expect(route).toContain("requireRequestUser(request)");
  });
});
