import "server-only";

import { authorizeScopedStudy } from "@/lib/scoped-study-auth";
import { fullyContainedStructureIds } from "@/lib/scoped-study-boundary";
import { matchesScopedReadingPin, SCOPED_READING_VERSION } from "@/lib/scoped-study-reading-pin";
import { sanitizeLegalHtmlCore } from "@/lib/legisbot/sanitize-legal-html-core";
import { collectPages } from "@/lib/law-question-pagination";
import { LawStudyApiError } from "@/lib/law-study-server";

type ReadingRow = { id: string; identificacao: string; ordem: string; legislacao: string; structure_id: number; lei_id: number; legislacao_atualizada_em: string | null };
type Cert = { recorte_id: string; reference_id: string; lei_id: number; structure_id: number; format_version: number; sha256: string; revoked_at: string | null };
const PAGE_SIZE = 100;

export async function loadScopedStudyMaterial(request: Request, slug: string, scopeId: string, mode: "reading" | "audio") {
  const context = await authorizeScopedStudy(request, slug, scopeId);
  const { supabase: db, lawId, title, recorte } = context;
  const permitted = fullyContainedStructureIds(context.structures, new Set(context.structureIds));

  // The navigation links and optional additional study-unit mappings do not
  // certify an entire audio file. Do not list metadata, paths or signed URLs
  // until an independent, versioned whole-file editorial certificate exists.
  if (mode === "audio") return { title, recorte, audios: [], status: "coverage_pending" as const };

  const ids = [...permitted];
  const blocks: ReadingRow[] = [];
  for (let start = 0; start < ids.length; start += PAGE_SIZE) {
    const chunk = ids.slice(start, start + PAGE_SIZE);
    const rows = await collectPages<ReadingRow>(async (from, to) => {
      const result = await db.from("legislative_references").select("id,identificacao,ordem,legislacao,structure_id,lei_id,legislacao_atualizada_em")
        .eq("lei_id", lawId).in("structure_id", chunk).not("preparado_em", "is", null)
        .or("situacao.is.null,situacao.neq.arquivada").order("ordem").order("id").range(from, to);
      if (result.error) throw new LawStudyApiError(503, "Não foi possível carregar a leitura deste recorte.");
      return result.data ?? [];
    }, PAGE_SIZE);
    blocks.push(...rows.filter((row) => row.lei_id === lawId && permitted.has(row.structure_id)));
  }
  const pins = new Map<string, Cert>();
  for (let start = 0; start < blocks.length; start += PAGE_SIZE) {
    const refs = blocks.slice(start, start + PAGE_SIZE).map((row) => row.id);
    const result = await db.from("scoped_reading_certificates")
      .select("recorte_id,reference_id,lei_id,structure_id,format_version,sha256,revoked_at")
      .eq("lei_id", lawId).eq("recorte_id", recorte.id).in("reference_id", refs);
    if (result.error) throw new LawStudyApiError(503, "Não foi possível verificar a revisão da leitura deste recorte.");
    for (const pin of (result.data ?? []) as Cert[]) {
      if (pin.recorte_id === recorte.id && pin.format_version === SCOPED_READING_VERSION && pin.revoked_at === null) pins.set(pin.reference_id, pin);
    }
  }
  const sorted = blocks.sort((a, b) => a.ordem.localeCompare(b.ordem, "pt-BR", { numeric: true }) || a.id.localeCompare(b.id));
  return { title, recorte, blocks: sorted.flatMap((row) => {
    const cert = pins.get(row.id);
    const rawHtml = String(row.legislacao ?? "");
    const legislation = sanitizeLegalHtmlCore(rawHtml).trim();
    const digestRow = { id: row.id, lawId, structureId: row.structure_id,
      order: row.ordem, label: row.identificacao, changedAt: row.legislacao_atualizada_em ? new Date(row.legislacao_atualizada_em).toISOString() : null, rawHtml, shippedHtml: legislation };
    if (!matchesScopedReadingPin(digestRow, cert && { refId: cert.reference_id,
      lawId: cert.lei_id, structureId: cert.structure_id, sha256: cert.sha256 }, permitted)) return [];
    return legislation ? [{ id: row.id, label: row.identificacao, legislation }] : [];
  }) };
}
