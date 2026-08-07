import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { googleDriveDownloadUrl, googleDriveFileId, isAllowedGoogleDriveResponseUrl, isDownloadableMaterialReference, parseMaterialId, safeDownloadFileName } from "./law-material-download";

const server = readFileSync("lib/law-material-download-server.ts", "utf8");
const route = readFileSync("app/api/aluno/estudar/lei/[slug]/materiais/[materialId]/download/route.ts", "utf8");
const pageServer = readFileSync("lib/law-study-server.ts", "utf8");
const client = readFileSync("components/law-study-page-client.tsx", "utf8");

describe("referências seguras de material", () => {
  const id = "1AbCdEfGhIjKlMnOp";

  it("aceita somente IDs válidos e seguros", () => {
    expect(parseMaterialId("42")).toBe(42);
    for (const invalid of ["", "0", "-1", "1.2", "1/../../2", "999999999999999999999"]) expect(parseMaterialId(invalid)).toBeNull();
  });

  it("reconhece somente referências HTTPS oficiais do Google Drive", () => {
    expect(googleDriveFileId(`https://drive.google.com/file/d/${id}/view?usp=sharing`)).toBe(id);
    expect(googleDriveFileId(`https://drive.google.com/open?id=${id}`)).toBe(id);
    expect(googleDriveFileId(`https://evil.example/file/d/${id}`)).toBeNull();
    expect(googleDriveFileId(`http://drive.google.com/file/d/${id}/view`)).toBeNull();
    expect(isDownloadableMaterialReference("google_drive", "baixar", `https://drive.google.com/file/d/${id}/view`)).toBe(true);
    expect(isDownloadableMaterialReference("google_drive", "abrir", `https://drive.google.com/file/d/${id}/view`)).toBe(false);
  });

  it("constrói o destino oficial sem aceitar redirecionamento para host arbitrário", () => {
    expect(googleDriveDownloadUrl(`https://drive.google.com/file/d/${id}/view`)).toBe(`https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`);
    expect(isAllowedGoogleDriveResponseUrl("https://drive.usercontent.google.com/download?id=x")).toBe(true);
    expect(isAllowedGoogleDriveResponseUrl("https://content.googleusercontent.com/file")).toBe(true);
    expect(isAllowedGoogleDriveResponseUrl("https://evil.example/file")).toBe(false);
  });

  it("gera nome de arquivo sem caracteres de cabeçalho", () => {
    expect(safeDownloadFileName("Legislação em Questões\r\nmalicioso", "flashcards")).toBe("Legislacao-em-Questoesmalicioso.apkg");
    expect(safeDownloadFileName("Lei esquematizada", "pdf")).toBe("Lei-esquematizada.pdf");
  });
});

describe("fronteira autenticada de download", () => {
  it("reutiliza a autenticação e a autorização da lei antes de buscar o material", () => {
    expect(server).toContain("authorizeLawStudy(request, slug)");
    expect(pageServer).toContain("auth.getUser(token)");
    expect(pageServer).toContain('.from("liberacoes_leis").select("id")');
    expect(pageServer).toContain('.eq("status", "ativo")');
    expect(server.indexOf("authorizeLawStudy(request, slug)")).toBeLessThan(server.indexOf('.from("materiais_leis")'));
  });

  it("vincula material, lei e estado ativo na mesma consulta", () => {
    expect(server).toContain('.eq("id", materialId)');
    expect(server).toContain('.eq("lei_id", lawId)');
    expect(server).toContain('.eq("ativo", true)');
    expect(server).toContain("Material temporariamente indisponível.");
  });

  it("faz proxy do arquivo sem devolver URL administrativa permanente", () => {
    expect(route).toContain("downloadAuthorizedLawMaterial");
    expect(route).toContain("export async function GET");
    expect(route).not.toMatch(/export async function (POST|PUT|PATCH|DELETE)/);
    expect(server).toContain('redirect: "follow"');
    expect(server).toContain('"Content-Disposition"');
    expect(server).toContain('"Cache-Control": "private, no-store, max-age=0"');
    expect(server).toContain('"X-Content-Type-Options": "nosniff"');
    expect(server).not.toContain("signedUrl");
  });

  it("rejeita arquivo ausente, HTML e redirecionamento para host não permitido", () => {
    expect(server).toContain("!upstream.ok");
    expect(server).toContain("!upstream.body");
    expect(server).toContain("!isAllowedGoogleDriveResponseUrl(upstream.url)");
    expect(server).toContain('contentType === "text/html"');
  });
});

describe("interface de download", () => {
  it("não inclui URL permanente na API da página", () => {
    expect(pageServer).toContain("downloadAvailable:");
    expect(pageServer).not.toMatch(/return \[\{[\s\S]*?url_externa:/);
    expect(client).not.toContain("url_externa");
  });

  it("habilita somente materiais disponíveis e trata carregamento e falha", () => {
    expect(client).toContain("material.downloadAvailable");
    expect(client).toContain("lawMaterialActionLabel(material)");
    expect(client).toContain("Material temporariamente indisponível");
    expect(client).toContain("Preparando download…");
    expect(client).toContain("Authorization: `Bearer ${token}`");
  });
});
