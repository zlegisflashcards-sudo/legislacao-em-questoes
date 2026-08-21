import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const server=readFileSync("lib/coach-admin-server.ts","utf8");
const migration=readFileSync("supabase/migrations/20260821140000_add_campaign_score_adjustments.sql","utf8");
const ranking=readFileSync("lib/public-law-ranking.ts","utf8");
describe("Painel de Coach e ajuste auditável de score",()=>{
 it("protege leituras e ajuste no servidor",()=>{expect(server.match(/requireAdmin\(\)/g)?.length).toBeGreaterThanOrEqual(3);expect(server).toContain("admin_ajustar_score_campanha");expect(server).toContain("reason.length > 1000");});
 it("filtra nome e e-mail no banco antes de aplicar a paginação",()=>{expect(server).toContain("studentsQuery = studentsQuery.or");expect(server.indexOf("studentsQuery = studentsQuery.or")).toBeLessThan(server.indexOf('.range((page - 1) * limit'));expect(server).not.toContain("(students ?? []).filter");});
 it("ordena a visão inicial por atividade antes de paginar",()=>{expect(server).toContain('const orderByStudyActivity = filter === "todos" && !query');expect(server).toContain('const right = b.lastActivity');expect(server).toContain('items: ordered.slice(start, start + limit)');});
 it("preserva score original, exige campanha concluída e audita cada ajuste",()=>{expect(migration).toContain("add column if not exists score_ajustado");expect(migration).toContain("if not v_before.concluida");expect(migration).toContain("admin_comercial_auditar");expect(migration).toContain("score_original");expect(migration).toContain("p_motivo");});
 it("usa o score efetivo na regra de ranking existente",()=>{expect(migration).toContain("coalesce(score_ajustado, score)");expect(ranking).toContain("campaign.score_ajustado");expect(ranking).toContain("effectiveScore");});
});
