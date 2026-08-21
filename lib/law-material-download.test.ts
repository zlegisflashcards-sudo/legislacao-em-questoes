import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { attachmentDisposition, googleDriveDownloadUrl, googleDriveFileId, isAccessibleMaterialReference, isAllowedGoogleDriveResponseUrl, isDownloadableMaterialReference, lawDownloadFileName, materialAccessReference, originalFileNameFromDisposition, parseMaterialId, safeDownloadFileName } from "./law-material-download";

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

  it("aceita URLs externas completas para abrir e mantém download do Drive por arquivo", () => {
    expect(googleDriveFileId(`https://drive.google.com/file/d/${id}/view?usp=sharing`)).toBe(id);
    expect(googleDriveFileId(`https://drive.google.com/open?id=${id}`)).toBe(id);
    expect(googleDriveFileId(`https://evil.example/file/d/${id}`)).toBeNull();
    expect(googleDriveFileId(`http://drive.google.com/file/d/${id}/view`)).toBeNull();
    expect(isDownloadableMaterialReference("google_drive", "baixar", `https://drive.google.com/file/d/${id}/view`)).toBe(true);
    expect(isDownloadableMaterialReference("google_drive", "abrir", `https://drive.google.com/file/d/${id}/view`)).toBe(false);
    expect(isAccessibleMaterialReference("google_drive", `https://drive.google.com/file/d/${id}/view`)).toBe(true);
    expect(isAccessibleMaterialReference("google_drive", "https://drive.google.com/drive/folders/abc123")).toBe(true);
    expect(isAccessibleMaterialReference("externo", "https://example.com/material")).toBe(true);
    expect(isAccessibleMaterialReference("externo", "http://example.com/material")).toBe(true);
    expect(materialAccessReference("google_drive", "abrir", `https://drive.google.com/file/d/${id}/view`)).toEqual({ available: true, directUrl: `https://drive.google.com/file/d/${id}/view` });
    expect(materialAccessReference("google_drive", "baixar", `https://drive.google.com/file/d/${id}/view`)).toEqual({ available: true, directUrl: null });
    expect(materialAccessReference("google_drive", "abrir", "https://drive.google.com/drive/folders/abc123")).toEqual({ available: true, directUrl: "https://drive.google.com/drive/folders/abc123" });
    expect(materialAccessReference("externo", "abrir", "https://example.com/material")).toEqual({ available: true, directUrl: "https://example.com/material" });
    expect(materialAccessReference("google_drive", "abrir", null)).toEqual({ available: false, directUrl: null });
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

  it("usa o nome sanitizado da lei e preserva somente a extensão original", () => {
    expect(originalFileNameFromDisposition("attachment; filename*=UTF-8''Lei%2014.751-2023.apkg")).toBe("Lei 14.751-2023.apkg");
    expect(originalFileNameFromDisposition('attachment; filename="Lei Orgânica.pdf"')).toBe("Lei Orgânica.pdf");
    expect(lawDownloadFileName("Lei 14.751/2023 — Lei Orgânica Nacional", "arquivo-original.apkg", "Flashcards", "flashcards")).toBe("Lei 14.751-2023 — Lei Orgânica Nacional.apkg");
    expect(lawDownloadFileName("  Lei Orgânica  ", "arquivo-original.pdf", "PDF", "pdf")).toBe("Lei Orgânica.pdf");
    expect(lawDownloadFileName("Lei: inválida?", "arquivo-original.pdf", "PDF", "pdf")).toBe("Lei inválida.pdf");
    expect(lawDownloadFileName(null, "arquivo original.pdf", "PDF", "pdf")).toBe("arquivo original.pdf");
    expect(lawDownloadFileName(null, null, "Flashcards", "flashcards")).toBe("Flashcards.apkg");
    expect(attachmentDisposition("Lei Orgânica.pdf")).toContain("filename*=UTF-8''Lei%20Org%C3%A2nica.pdf");
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
    expect(server).toContain("originalFileNameFromDisposition(upstream.headers.get");
    expect(server).toContain("lawDownloadFileName(lawTitle, originalFileName, title, type)");
    expect(server).toContain("attachmentDisposition(fileName)");
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
  it("mantém o download APKG dentro do modal secundário de Materiais", () => {
    expect(pageServer).toContain("accessAvailable:");
    expect(pageServer).toContain("accessUrl: access.directUrl");
    expect(client).toContain('function Materials'); expect(client).toContain('>Materiais<'); expect(client).toContain('AnkiModal'); expect(client).toContain('materiais/${material.id}/download');
  });

  it("mantém tutorial e download autenticado do Anki", () => {
    expect(client).toContain('resolveLawStudyPlatformTutorials'); expect(client).toContain('Baixar deck (.apkg)');
    expect(client).toContain("Authorization: `Bearer ${token}`");
    expect(client).toContain('material.type === "pdf" ? "material.pdf" : "flashcards.apkg"');
  });
});
