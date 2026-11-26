import "server-only";
import { TJSP_L9099_SCOPE_ID } from "./tjsp-l9099-reading-manifest";
import { loadReviewedTjspReading } from "./tjsp-reviewed-reading-server";

export function loadReviewedTjspL9099(slug: string, lawId: number, selected: ReadonlySet<number>) {
  return loadReviewedTjspReading(TJSP_L9099_SCOPE_ID, slug, lawId, selected);
}
