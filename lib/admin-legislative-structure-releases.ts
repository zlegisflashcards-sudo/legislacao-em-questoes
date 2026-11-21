import "server-only";

import { obterAdministrador } from "@/lib/admin-auth";
import { getAdminLegislativeStructureIntegrity } from "@/lib/admin-legislative-structure-integrity";
import { canReleaseStructure, structureReleaseViewStatus, type StructureReleaseRecord } from "@/lib/legisbot/continuous-reading-structure-release-core";
import { continuousReadingIntegrityFingerprint } from "@/lib/legisbot/continuous-reading-integrity-fingerprint";
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
  constructor(readonly code: "migration_pending" | "stale_integrity" | "not_ready" | "root_required" | "law_unavailable" | "blocked_descendant" | "invalid_structure" | "invalid_candidates" | "database", message: string) {
    super(message);
    this.name = "LegislativeStructureReleaseError";
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requireAdmin() {
  return obterAdministrador().then((admin) => {
    if (!admin) throw new LegislativeStructureReleaseError("database", "Autenticação administrativa obrigatória.");
    return admin;
  });
}

function migrationPending(error: { code?: string } | null) {
  // PGRST202 é retornado pelo PostgREST quando a RPC ainda não entrou no
  // schema cache — exatamente o estado entre publicar o código e aplicar a
  // migration que cria a confirmação transacional.
  return error?.code === "42P01" || error?.code === "PGRST205" || error?.code === "PGRST204" || error?.code === "PGRST202";
}

async function readReleases(lawId: number) {
  const result = await getSupabaseServerClient().from("legislative_structure_releases")
    .select("structure_id,lei_id,status,released_at,released_by,blocked_at,blocked_by")
    .eq("lei_id", lawId);
  if (migrationPending(result.error)) throw new LegislativeStructureReleaseError("migration_pending", "A migration de liberação por estrutura ainda não foi aplicada.");
  if (result.error) throw new LegislativeStructureReleaseError("database", "Não foi possível consultar as liberações estruturais.");
  return (result.data ?? []) as ReleaseRow[];
}

/**
 * A tabela de liberações e a RPC de confirmação foram introduzidas em
 * migrations distintas. A tela administrativa precisa testar ambas, para não
 * habilitar um botão que ainda não tem executor transacional no banco.
 *
 * A chamada usa valores impossíveis e é sempre recusada antes de qualquer
 * escrita; P0001 comprova que a função existe, enquanto PGRST202 significa que
 * ela ainda não está exposta pelo schema cache do PostgREST.
 */
async function confirmationRpcAvailable() {
  const probe = await getSupabaseServerClient().rpc("confirmar_e_liberar_estrutura_legislativa", {
    p_lei_id: -1,
    p_structure_id: -1,
    p_reference_ids: [],
    p_snapshot: {},
    p_ator_user_id: "00000000-0000-0000-0000-000000000000",
  });
  return !probe.error || probe.error.code === "P0001";
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
      confirmationAvailable: await confirmationRpcAvailable(),
      releases: rows,
      structures: report.integrity.reports.map((item) => ({
        ...item,
        isRoot: report.structureNodes.find((structure) => structure.id === item.structureId)?.parentId === null,
        suggestedAssociationCount: report.referenceAssociations.filter((association) => association.pending && association.suggestionStatus === "associated" && association.suggestedStructureId === item.structureId).length,
        integrityFingerprint: continuousReadingIntegrityFingerprint(item),
        releaseStatus: structureReleaseViewStatus({ report: item, structures: report.structureNodes, records }),
      })),
    };
  } catch (error) {
    if (error instanceof LegislativeStructureReleaseError && error.code === "migration_pending") return { ...report, migrationAvailable: false, confirmationAvailable: false, releases: [], structures: [] };
    throw error;
  }
}

/**
 * Confirma novamente a integridade no servidor. Nenhum estado vindo do
 * formulário decide a liberação; o cliente envia apenas ação e estrutura.
 */
export async function setAdminLegislativeStructureRelease(input: { lawSlug: unknown; structureId: unknown; action: unknown; integrityFingerprint?: unknown }) {
  const admin = await requireAdmin();
  const slug = typeof input.lawSlug === "string" ? input.lawSlug.trim().toLowerCase() : "";
  const structureId = typeof input.structureId === "number" ? input.structureId : typeof input.structureId === "string" && INTEGER.test(input.structureId) ? Number(input.structureId) : NaN;
  const action = input.action === "release" || input.action === "block" ? input.action : null;
  const expectedFingerprint = typeof input.integrityFingerprint === "string" ? input.integrityFingerprint : "";
  if (!slug || !Number.isSafeInteger(structureId) || structureId <= 0 || !action) throw new LegislativeStructureReleaseError("invalid_structure", "Estrutura ou ação de liberação inválida.");

  const diagnostic = await getAdminLegislativeStructureIntegrity(slug);
  if (!diagnostic) throw new LegislativeStructureReleaseError("invalid_structure", "Legislação não encontrada.");
  const target = diagnostic.integrity.reports.find((item) => item.structureId === structureId);
  if (!target) throw new LegislativeStructureReleaseError("invalid_structure", "A estrutura não pertence a esta lei.");
  if (diagnostic.structureNodes.find((item) => item.id === structureId)?.parentId !== null) throw new LegislativeStructureReleaseError("root_required", "Somente uma estrutura sem pai pode ser liberada ou fechada. Escolha o Título raiz correspondente.");
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
    if (!expectedFingerprint || expectedFingerprint !== continuousReadingIntegrityFingerprint(freshTarget)) {
      throw new LegislativeStructureReleaseError("stale_integrity", "O diagnóstico mudou desde a prévia. Atualize a conferência antes de liberar a estrutura.");
    }
    const decision = canReleaseStructure({ report: freshTarget, structures: fresh.structureNodes, records: compactRecords(currentRows) });
    if (!decision.allowed) {
      throw new LegislativeStructureReleaseError(decision.reason === "root_required" ? "root_required" : "not_ready", decision.reason === "root_required" ? "Somente uma estrutura sem pai pode ser liberada. Libere o Título que contém este recorte." : "A estrutura não está pronta para liberação. Atualize o diagnóstico e resolva as pendências.");
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

/**
 * O atalho legado liberava filhos em massa. A política atual exige decisão
 * explícita no Título raiz e não chama a RPC antiga que gravaria os filhos.
 */
export async function releaseEntireLegislativeLaw(input: { lawSlug: unknown }): Promise<{ released: number; idempotent: boolean }> {
  await requireAdmin();
  const slug = typeof input.lawSlug === "string" ? input.lawSlug.trim().toLowerCase() : "";
  if (!slug) throw new LegislativeStructureReleaseError("invalid_structure", "Legislação inválida.");
  throw new LegislativeStructureReleaseError("root_required", "A liberação geral foi desativada. Libere cada Título raiz separadamente.");
}

/**
 * Prévia já confirmada pelo administrador: primeiro simula os vínculos no
 * mesmo diagnóstico TypeScript; em seguida a RPC compara a fotografia inteira
 * antes de gravar vínculos e liberação na mesma transação do Postgres.
 */
export async function confirmAndReleaseLegislativeStructure(input: { lawSlug: unknown; structureId: unknown; referenceIds: unknown }) {
  const admin = await requireAdmin();
  const slug = typeof input.lawSlug === "string" ? input.lawSlug.trim().toLowerCase() : "";
  const structureId = typeof input.structureId === "number" ? input.structureId : typeof input.structureId === "string" && INTEGER.test(input.structureId) ? Number(input.structureId) : NaN;
  const receivedReferenceIds = Array.isArray(input.referenceIds) ? input.referenceIds : [];
  if (receivedReferenceIds.some((id) => typeof id !== "string" || !UUID.test(id))) {
    throw new LegislativeStructureReleaseError("invalid_candidates", "A prévia contém um UUID de bloco inválido. Atualize-a antes de confirmar.");
  }
  const referenceIds = [...new Set(receivedReferenceIds as string[])];
  if (!slug || !Number.isSafeInteger(structureId) || structureId <= 0) throw new LegislativeStructureReleaseError("invalid_structure", "Estrutura inválida.");
  const current = await getAdminLegislativeStructureIntegrity(slug);
  if (!current || !current.structureNodes.some((item) => item.id === structureId)) throw new LegislativeStructureReleaseError("invalid_structure", "A estrutura não pertence a esta lei.");
  if (current.structureNodes.find((item) => item.id === structureId)?.parentId !== null) throw new LegislativeStructureReleaseError("root_required", "A confirmação só pode liberar uma estrutura sem pai. Escolha o Título raiz correspondente.");
  if (!current.law.ativo || current.law.status_publicacao !== "ativa") throw new LegislativeStructureReleaseError("law_unavailable", "A lei não está ativa para disponibilização pública.");
  const associationsByReferenceId = new Map(current.referenceAssociations.map((item) => [item.referenceId, item]));
  if (referenceIds.some((id) => {
    const association = associationsByReferenceId.get(id);
    return !association || (!association.pending && association.currentStructureId !== structureId);
  })) throw new LegislativeStructureReleaseError("invalid_candidates", "A prévia contém bloco já associado, inválido ou alterado. Atualize-a antes de confirmar.");
  const pendingReferenceIds = referenceIds.filter((id) => associationsByReferenceId.get(id)?.pending);
  const currentReleases = await readReleases(current.law.id);
  const targetRelease = currentReleases.find((release) => Number(release.structure_id) === structureId);
  if (!pendingReferenceIds.length && targetRelease?.status === "released") return { associated: 0, released: true, idempotent: true };
  const proposed = new Map(pendingReferenceIds.map((id) => [id, structureId]));
  const verified = await getAdminLegislativeStructureIntegrity(slug, proposed);
  const target = verified?.integrity.reports.find((item) => item.structureId === structureId);
  if (!verified || !target) throw new LegislativeStructureReleaseError("invalid_structure", "Não foi possível revalidar a estrutura.");
  const releases = currentReleases;
  const decision = canReleaseStructure({ report: target, structures: verified.structureNodes, records: compactRecords(releases) });
  if (!decision.allowed) throw new LegislativeStructureReleaseError(decision.reason === "root_required" ? "root_required" : "not_ready", decision.reason === "root_required" ? "A confirmação só pode liberar uma estrutura sem pai. Escolha o Título raiz correspondente." : "A prévia possui pendências impeditivas; nenhuma associação foi gravada.");
  const committed = await getSupabaseServerClient().rpc("confirmar_e_liberar_estrutura_legislativa", {
    p_lei_id: verified.law.id,
    p_structure_id: structureId,
    p_reference_ids: pendingReferenceIds,
    p_snapshot: current.integritySnapshot,
    p_ator_user_id: admin.id,
  });
  if (migrationPending(committed.error)) throw new LegislativeStructureReleaseError("migration_pending", "A migration da confirmação transacional ainda não foi aplicada.");
  if (committed.error) {
    const message = committed.error.message ?? "";
    if (/diagnóstico mudou/i.test(message)) throw new LegislativeStructureReleaseError("stale_integrity", message);
    if (/descendente bloqueado/i.test(message)) throw new LegislativeStructureReleaseError("blocked_descendant", message);
    throw new LegislativeStructureReleaseError("database", "A confirmação transacional não foi concluída; nenhum vínculo foi confirmado.");
  }
  return { associated: pendingReferenceIds.length, released: true, idempotent: false };
}
