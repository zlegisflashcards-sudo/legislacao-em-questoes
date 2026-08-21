export type StudentLaw = {
  id: number;
  slug: string;
  titulo: string;
  nomeCurto: string | null;
  descricao: string | null;
  codigo: string | null;
  categoria: string | null;
  thumbnailUrl: string | null;
  ordem: number;
  totalFlashcards: number;
  versaoMaterial: string | null;
  revisadoEm: string | null;
  publicadoEm: string | null;
  situacaoAtualizacao: StudentLawUpdateStatus;
  houveAlteracaoLegislativa: boolean;
  referenciaNormativaAtual: string | null;
  tipoReferenciaNormativa: StudentLawReferenceType;
  campaignStatus?: "nao_iniciada" | "em_andamento" | "concluida";
  campaignProgress?: number;
};

export type StudentLawUpdateStatus = "atualizado" | "revisao_pendente" | "desatualizado" | "em_revisao";
export type StudentLawReferenceType = "originaria" | "alteracao";

const updateStatusLabels: Record<StudentLawUpdateStatus, string> = {
  atualizado: "Material atualizado",
  revisao_pendente: "Revisão pendente",
  desatualizado: "Material desatualizado",
  em_revisao: "Material em revisão",
};

export function studentLawStatusLabel(status: StudentLawUpdateStatus) {
  return updateStatusLabels[status];
}

export function studentLawReferenceLabel(type: StudentLawReferenceType) {
  return type === "alteracao" ? "Última alteração incorporada" : "Norma originária";
}

export function studentLawShortNameForDisplay(law: Pick<StudentLaw, "titulo" | "nomeCurto">) {
  const shortName = law.nomeCurto?.trim();
  if (!shortName) return null;
  return shortName.toLocaleLowerCase("pt-BR") === law.titulo.trim().toLocaleLowerCase("pt-BR") ? null : shortName;
}

const allowedRpcKeys = new Set([
  "id", "slug", "titulo", "nome_curto", "descricao", "codigo",
  "categoria", "thumbnail_url", "ordem", "fontes_ativas", "total_flashcards",
  "versao_material", "revisado_em", "publicado_em", "situacao_atualizacao",
  "houve_alteracao_legislativa", "referencia_normativa_atual", "tipo_referencia_normativa",
]);

const updateStatuses = new Set<StudentLawUpdateStatus>(["atualizado", "revisao_pendente", "desatualizado", "em_revisao"]);
const referenceTypes = new Set<StudentLawReferenceType>(["originaria", "alteracao"]);

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function nonNegativeInteger(value: unknown) {
  const parsed = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  return typeof parsed === "number" && Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function optionalIsoDate(value: unknown) {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : undefined;
}

export function parseStudentLawRows(value: unknown): StudentLaw[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const record = row as Record<string, unknown>;
    if ([...Object.keys(record)].some((key) => !allowedRpcKeys.has(key))) return [];
    const id = Number(record.id);
    const ordem = Number(record.ordem);
    const totalFlashcards = nonNegativeInteger(record.total_flashcards);
    const revisadoEm = optionalIsoDate(record.revisado_em);
    const publicadoEm = optionalIsoDate(record.publicado_em);
    const status = record.situacao_atualizacao as StudentLawUpdateStatus;
    const referenceType = record.tipo_referencia_normativa as StudentLawReferenceType;
    if (!Number.isSafeInteger(id) || id <= 0 || typeof record.slug !== "string" || !record.slug.trim() || typeof record.titulo !== "string" || !record.titulo.trim()) return [];
    if (totalFlashcards === null || revisadoEm === undefined || publicadoEm === undefined || !updateStatuses.has(status) || typeof record.houve_alteracao_legislativa !== "boolean" || !referenceTypes.has(referenceType)) return [];
    if ((record.houve_alteracao_legislativa && referenceType !== "alteracao") || (!record.houve_alteracao_legislativa && referenceType !== "originaria")) return [];

    return [{
      id,
      slug: record.slug.trim(),
      titulo: record.titulo.trim(),
      nomeCurto: optionalText(record.nome_curto),
      descricao: optionalText(record.descricao),
      codigo: optionalText(record.codigo),
      categoria: optionalText(record.categoria),
      thumbnailUrl: optionalText(record.thumbnail_url),
      ordem: Number.isSafeInteger(ordem) && ordem >= 0 ? ordem : 0,
      totalFlashcards,
      versaoMaterial: optionalText(record.versao_material),
      revisadoEm,
      publicadoEm,
      situacaoAtualizacao: status,
      houveAlteracaoLegislativa: record.houve_alteracao_legislativa,
      referenciaNormativaAtual: optionalText(record.referencia_normativa_atual),
      tipoReferenciaNormativa: referenceType,
    }];
  });
}

function normalizeSearch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
}

export function filterStudentLaws(laws: StudentLaw[], search: string) {
  const query = normalizeSearch(search);
  if (!query) return laws;
  return laws.filter((law) => normalizeSearch([
    law.titulo,
    law.nomeCurto,
    law.codigo,
    law.categoria,
    law.referenciaNormativaAtual,
    law.versaoMaterial,
  ].filter(Boolean).join(" ")).includes(query));
}
