import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { TJSP_L9099_LAW_ID, TJSP_L9099_ROOTS, TJSP_L9099_SCOPE_ID, TJSP_L9099_SLUG, tjspL9099Manifest } from "./tjsp-l9099-reading-manifest";
import { TJSP_L10261_LAW_ID, TJSP_L10261_ROOTS, TJSP_L10261_SCOPE_ID, TJSP_L10261_SLUG, tjspL10261Manifest } from "./tjsp-l10261-reading-manifest";
import { buildReviewedReading } from "./tjsp-reviewed-reading-core";

type ReviewedEdition = { lawId: number; roots: readonly number[]; slug: string; manifest: readonly (readonly [string, string, number, string])[] };
const reviewedEditions = new Map<string, ReviewedEdition>([
  [TJSP_L9099_SCOPE_ID, { lawId: TJSP_L9099_LAW_ID, roots: TJSP_L9099_ROOTS, slug: TJSP_L9099_SLUG, manifest: tjspL9099Manifest }],
  [TJSP_L10261_SCOPE_ID, { lawId: TJSP_L10261_LAW_ID, roots: TJSP_L10261_ROOTS, slug: TJSP_L10261_SLUG, manifest: tjspL10261Manifest }],
]);

export function hasReviewedTjspReading(scopeId: string) {
  return reviewedEditions.has(scopeId);
}

/** Called only after the active recorte, feature flag, and student grant are checked. */
export async function loadReviewedTjspReading(scopeId: string, slug: string, lawId: number, selected: ReadonlySet<number>) {
  const edition = reviewedEditions.get(scopeId);
  if (!edition || slug.toLowerCase() !== edition.slug || lawId !== edition.lawId
    || selected.size !== edition.roots.length || edition.roots.some((root) => !selected.has(root))) return null;
  const db = getSupabaseServerClient();
  const ids = edition.manifest.map(([id]) => id);
  const batches = Array.from({ length: Math.ceil(ids.length / 48) }, (_, i) => ids.slice(i * 48, (i + 1) * 48));
  const [law, results, nodes, releases] = await Promise.all([
    db.from("leis").select("id,slug,titulo,nome_curto,codigo").eq("id", lawId).eq("slug", edition.slug).eq("ativo", true).eq("status_publicacao", "ativa").maybeSingle(),
    Promise.all(batches.map((batch) => db.from("legislative_references").select("id,ordem,identificacao,structure_id,legislacao,preparado_em,situacao").eq("lei_id", lawId).in("id", batch))),
    db.from("law_structure").select("id,parent_id,ordem,tipo,nome").eq("lei_id", lawId).eq("ativo", true),
    db.from("legislative_structure_releases").select("structure_id").eq("lei_id", lawId).eq("status", "blocked"),
  ]);
  if (law.error || results.some((result) => result.error || !result.data) || nodes.error || releases.error || !law.data || !nodes.data) return null;
  return buildReviewedReading({ law: law.data, manifest: edition.manifest, rows: results.flatMap((result) => result.data ?? []), nodes: nodes.data,
    selected, blocked: new Set((releases.data ?? []).map((row) => Number(row.structure_id))) });
}
