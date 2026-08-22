import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin-auth", () => ({ obterAdministrador: vi.fn(async () => ({ id: "__ADMIN_READONLY_TEST__" })) }));

const envFile = ".env.local";
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}

const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
const describePreview = configured ? describe : describe.skip;

describePreview("prévia APKG administrativa", () => {
  it("propaga os diagnósticos impeditivos do parser sem persistir dados", async () => {
    const { buildLawApkg } = await import("./anki-apkg-export");
    const { previewApkgImport } = await import("./admin-questoes-server");
    const exported = await buildLawApkg(
      { slug: "l9455", titulo: "Lei nº 9.455 - Crimes de Tortura" },
      [{ id: "__ADMIN_READONLY_TEST__", structure_id: null, pergunta: "Questão descartada pelo parser", resposta: "Talvez", ordem: "9999.C.00.02", slug: "l9455" }],
      [],
    );
    const bytes = exported.bytes.buffer.slice(exported.bytes.byteOffset, exported.bytes.byteOffset + exported.bytes.byteLength) as ArrayBuffer;
    const preview = await previewApkgImport("l9455", new File([bytes], "__ADMIN_READONLY_TEST__.apkg", { type: "application/octet-stream" }));

    expect(preview.summary.erros).toBe(1);
    expect(preview.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "resposta", received: "Talvez", motivo: expect.stringContaining("Resposta inválida") }),
    ]));
    expect(preview.total).toBe(0);
  });
});
