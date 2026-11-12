import "server-only";

import { obterAdministrador } from "@/lib/admin-auth";
import { getAdminLegislativeStructureIntegrity } from "@/lib/admin-legislative-structure-integrity";
import { canReleaseStructure, structureReleaseViewStatus, type StructureReleaseRecord } from "@/lib/legisbot/continuous-reading-structure-release-core";
import { getSupabaseServerClient } from "@/lib/supabase-server";

const INTEGER = /^\d+$/;

type ReleaseRow = {
  structure_id: number;
  lei_id: number;
  status: "released" | "blocked";
  released_at: string | null;
  released_by: string | null;
  blocked_at: string | null;
  blocked_by: string | null;
};

export class LegislativeStructureReleaseError extends Error {
  constructor(readonly code: "migration_pending" | "not_ready" | "law_unavailable" | "blocked_descendant" | "invalid_structure" | "database", message: string) {
    super(message);
    this.name = "LegislativeStructureReleaseError";
  }
}

function requireAdmin() {
  return obterAdministrador().then((admin) => {
    if (!admin) throw new LegislativeStructureReleaseError("database", "Autenticação administrativa obrigatória.");
    return admin;
  });
}

function migrationPending(error: { code?: string } | null) {
  return error?.code === "42P01" || error?.code === "PGRST205" || error?.code === "PGRST204";
}

async function readReleases(lawId: number) {
  const result = await getSupabaseServerClient().from("legislative_structure_releases")
    .select("structure_id,lei_id,status,released_at,released_by,blocked_at,blocked_by")
    .eq("lei_id", lawId);
  if (migrationPending(result.error)) throw new LegislativeStructureReleaseError("migration_pending", "A migration de liberação por estrutura ainda não foi aplicada.");
  if (result.error) throw new LegislativeStructureReleaseError("database", "Não foi possível consultar as liberações estruturais.");
  return (result.data ?? []) as ReleaseRow[];
}

function compactRecords(rows: ReleaseRow[]): StructureReleaseRecord[] {
  return rows.map((row) => ({ structureId: Number(row.structure_id), status: row.status }));
}

export async function getAdminLegislativeStructureReleaseDashboard(rawSlug: string) {
  const report = await getAdminLegislativeStructureIntegrity(rawSlug);
  if (!report) return null;
  try {
    const rows = await readReleases(report.law.id);
    const records = compactRecords(rows);
    return {
      ...report,
      migrationAvailable: true,
      releases: rows,
      structures: report.integrity.reports.map((item) => ({
        ...item,
        releaseStatus: structureReleaseViewStatus({ report: item, structures: report.structureNodes, records }),
      })),
    };
  } catch (error) {
    if (error instanceof LegislativeStructureReleaseError && error.code === "migration_pending") return { ...report, migrationAvailable: false, releases: [], structures: [] };
    throw error;
  }
}

/**
 * Confirma novamente a integridade no servidor. Nenhum estado vindo do
 * formulário decide a liberação; o cliente envia apenas ação e estrutura.
 */
export async function setAdminLegislativeStructureRelease(input: { lawSlug: unknown; structureId: unknown; action: unknown }) {
  const admin = await requireAdmin();
  const slug = typeof input.lawSlug === "string" ? input.lawSlug.trim().toLowerCase() : "";
  const structureId = typeof input.structureId === "number" ? input.structureId : typeof input.structureId === "string" && INTEGER.test(input.structureId) ? Number(input.structureId) : NaN;
  const action = input.action === "release" || input.action === "block" ? input.action : null;
  if (!slug || !Number.isSafeInteger(structureId) || structureId <= 0 || !action) throw new LegislativeStructureReleaseError("invalid_structure", "Estrutura ou ação de liberação inválida.");

  const diagnostic = await getAdminLegislativeStructureIntegrity(slug);
  if (!diagnostic) throw new LegislativeStructureReleaseError("invalid_structure", "Legislação não encontrada.");
  const target = diagnostic.integrity.reports.find((item) => item.structureId === structureId);
  if (!target) throw new LegislativeStructureReleaseError("invalid_structure", "A estrutura não pertence a esta lei.");
  if (action === "release" && (!diagnostic.law.ativo || diagnostic.law.status_publicacao !== "ativa")) {
    throw new LegislativeStructureReleaseError("law_unavailable", "A lei não está ativa para disponibilização pública.");
  }
  const currentRows = await readReleases(diagnostic.law.id);
  const current = currentRows.find((row) => Number(row.structure_id) === structureId) ?? null;
  if (current?.status === (action === "release" ? "released" : "blocked")) return { status: current.status, changed: false };

  if (action === "release") {
    // Segunda leitura imediatamente antes da escrita reduz a janela de corrida
    // sem confiar em um diagnóstico enviado pela interface.
    const fresh = await getAdminLegislativeStructureIntegrity(slug);
    const freshTarget = fresh?.integrity.reports.find((item) => item.structureId === structureId);
    if (!fresh || !freshTarget) throw new LegislativeStructureReleaseError("invalid_structure", "A estrutura não pertence a esta lei.");
    const decision = canReleaseStructure({ report: freshTarget, structures: fresh.structureNodes, records: compactRecords(currentRows) });
    if (!decision.allowed) {
      throw new LegislativeStructureReleaseError(decision.reason === "blocked_descendant" ? "blocked_descendant" : "not_ready", decision.reason === "blocked_descendant" ? "Existe descendente bloqueado explicitamente; revise-o antes de liberar este recorte." : "A estrutura não está pronta para liberação. Atualize o diagnóstico e resolva as pendências.");
    }
  }

  const now = new Date().toISOString();
  const next: ReleaseRow = action === "release"
    ? { structure_id: structureId, lei_id: diagnostic.law.id, status: "released", released_at: now, released_by: admin.id, blocked_at: current?.blocked_at ?? null, blocked_by: current?.blocked_by ?? null }
    : { structure_id: structureId, lei_id: diagnostic.law.id, status: "blocked", released_at: current?.released_at ?? null, released_by: current?.released_by ?? null, blocked_at: now, blocked_by: admin.id };
  const saved = await getSupabaseServerClient().from("legislative_structure_releases").upsert(next, { onConflict: "structure_id" }).select("structure_id,status").maybeSingle();
  if (migrationPending(saved.error)) throw new LegislativeStructureReleaseError("migration_pending", "A migration de liberação por estrutura ainda não foi aplicada.");
  if (saved.error || !saved.data) throw new LegislativeStructureReleaseError("database", "Não foi possível persistir a liberação estrutural.");
  const audit = await getSupabaseServerClient().rpc("admin_comercial_auditar", {
    p_ator_user_id: admin.id, p_acao: action === "release" ? "liberar" : "bloquear", p_entidade: "liberacao_estrutura_lei", p_entidade_id: String(structureId),
    p_anterior: current, p_posterior: next, p_detalhes: { lei_id: diagnostic.law.id, origem: "lei_interativa_2" },
  });
  if (audit.error) console.error("Falha ao auditar liberação estrutural", { structureId, code: audit.error.code });
  return { status: saved.data.status as "released" | "blocked", changed: true };
}
