import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { TJSP_L9099_LAW_ID, TJSP_L9099_ROOTS, TJSP_L9099_SLUG, tjspL9099Manifest } from "./tjsp-l9099-reading-manifest";
import { buildReviewedReading } from "./tjsp-reviewed-reading-core";

/** Called only after the active recorte, feature flag, and student grant are checked. */
export async function loadReviewedTjspL9099(slug: string, lawId: number, selected: ReadonlySet<number>) {
  if (slug.toLowerCase() !== TJSP_L9099_SLUG || lawId !== TJSP_L9099_LAW_ID
    || selected.size !== TJSP_L9099_ROOTS.length || TJSP_L9099_ROOTS.some((root) => !selected.has(root))) return null;
  const db = getSupabaseServerClient();
  const [law, rows, nodes, releases] = await Promise.all([
    db.from("leis").select("id,slug,titulo,nome_curto,codigo").eq("id", lawId).eq("slug", TJSP_L9099_SLUG).eq("ativo", true).eq("status_publicacao", "ativa").maybeSingle(),
    db.from("legislative_references").select("id,ordem,identificacao,structure_id,legislacao,preparado_em,situacao")
      .eq("lei_id", lawId).in("id", tjspL9099Manifest.map(([id]) => id)),
    db.from("law_structure").select("id,parent_id,ordem,tipo,nome").eq("lei_id", lawId).eq("ativo", true),
    db.from("legislative_structure_releases").select("structure_id").eq("lei_id", lawId).eq("status", "blocked"),
  ]);
  if (law.error || rows.error || nodes.error || releases.error || !law.data || !rows.data || !nodes.data) return null;
  return buildReviewedReading({ law: law.data, manifest: tjspL9099Manifest, rows: rows.data, nodes: nodes.data,
    selected, blocked: new Set((releases.data ?? []).map((row) => Number(row.structure_id))) });
}
