import "server-only";

import { authorizeLawStudy, LawStudyApiError } from "@/lib/law-study-server";
import { googleDriveDownloadUrl, isAllowedGoogleDriveResponseUrl, isDownloadableMaterialReference, parseMaterialId, safeDownloadFileName } from "@/lib/law-material-download";
import type { LawStudyMaterial } from "@/lib/law-study";

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function downloadAuthorizedLawMaterial(request: Request, slug: string, rawMaterialId: string) {
  const materialId = parseMaterialId(rawMaterialId);
  if (materialId === null) throw new LawStudyApiError(400, "Identificador de material inválido.");

  const { supabase, lawId } = await authorizeLawStudy(request, slug);
  const { data, error } = await supabase
    .from("materiais_leis")
    .select("id,lei_id,tipo,titulo,provedor,url_externa,acao,ativo")
    .eq("id", materialId)
    .eq("lei_id", lawId)
    .eq("ativo", true)
    .maybeSingle();
  if (error) throw new LawStudyApiError(503, "Não foi possível preparar o material agora.");

  const material = record(data);
  const provider = text(material?.provedor);
  const action = text(material?.acao);
  const source = text(material?.url_externa);
  const title = text(material?.titulo);
  const type = text(material?.tipo) as LawStudyMaterial["type"] | null;
  if (!material || !title || !type || !isDownloadableMaterialReference(provider, action, source)) {
    throw new LawStudyApiError(404, "Material temporariamente indisponível.");
  }

  const upstreamUrl = googleDriveDownloadUrl(source as string);
  if (!upstreamUrl) throw new LawStudyApiError(404, "Material temporariamente indisponível.");

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, { cache: "no-store", redirect: "follow" });
  } catch {
    throw new LawStudyApiError(503, "Material temporariamente indisponível.");
  }
  const contentType = upstream.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "application/octet-stream";
  if (!upstream.ok || !upstream.body || !isAllowedGoogleDriveResponseUrl(upstream.url) || contentType === "text/html") {
    await upstream.body?.cancel();
    throw new LawStudyApiError(503, "Material temporariamente indisponível.");
  }

  const headers = new Headers({
    "Cache-Control": "private, no-store, max-age=0",
    "Content-Disposition": `attachment; filename="${safeDownloadFileName(title, type)}"`,
    "Content-Type": contentType,
    "X-Content-Type-Options": "nosniff",
  });
  const contentLength = upstream.headers.get("content-length");
  if (contentLength && /^\d+$/.test(contentLength)) headers.set("Content-Length", contentLength);
  return new Response(upstream.body, { status: 200, headers });
}
