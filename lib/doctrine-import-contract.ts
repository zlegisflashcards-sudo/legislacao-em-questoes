/**
 * Contrato neutro para fontes de doutrina. Ele deliberadamente não reutiliza
 * artigo, legislação ou total_artigos: esses nomes pertencem ao fluxo legal.
 * A camada que persistirá este contrato será adicionada somente com a migration
 * de tipo de conteúdo aprovada.
 */
export const DOCTRINE_APKG_FIELDS = [
  "IDQuestao", "titulo", "estrutura", "assunto", "ordem", "totalAssuntos",
  "pergunta", "resposta", "justificativa", "resumo", "referencia", "versao",
] as const;

export type DoctrineApkgField = (typeof DOCTRINE_APKG_FIELDS)[number];
export type DoctrineImportRow = Record<DoctrineApkgField, string> & { deck: string[] };
export type DoctrineImportIssue = { row: number; field: DoctrineApkgField | "deck"; message: string };

export type DoctrineImportPreview = {
  rows: DoctrineImportRow[];
  issues: DoctrineImportIssue[];
  topicCount: number;
  structureCount: number;
  /** Ordens são globais no baralho, nunca artigos. */
  orders: string[];
};

/** Formato serializado de uma nota APKG transferida para validação local. */
export type DoctrineSerializedNote = readonly [
  number | string,
  string,
  number | string,
  number | string,
  string,
  readonly string[],
];

export type DoctrineTransferPayload = {
  noteColumns: readonly string[];
  fieldNames: readonly string[];
  decks: Record<string, { name?: string }>;
  notes: readonly DoctrineSerializedNote[];
};

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ANSWERS = new Set(["certo", "errado"]);

function text(row: DoctrineImportRow, field: DoctrineApkgField) { return row[field].trim(); }

/**
 * Converte o JSON serializado do APKG em linhas do contrato de doutrina.
 * A conversão é estrita: não infere campos, artigos ou slugs.
 */
export function doctrineRowsFromTransfer(payload: DoctrineTransferPayload): DoctrineImportRow[] {
  if (payload.noteColumns.join("|") !== "id|guid|mid|did|tags|fields") {
    throw new Error("Formato de notas de doutrina incompatível.");
  }
  if (payload.fieldNames.join("|") !== DOCTRINE_APKG_FIELDS.join("|")) {
    throw new Error("Campos do modelo de doutrina incompatíveis.");
  }

  return payload.notes.map((note, index) => {
    const fields = note[5];
    if (!Array.isArray(fields) || fields.length !== DOCTRINE_APKG_FIELDS.length) {
      throw new Error(`Nota de doutrina ${index + 1} tem campos incompletos.`);
    }

    const did = String(note[3]);
    const deckName = payload.decks[did]?.name;
    if (!deckName) throw new Error(`Nota de doutrina ${index + 1} referencia baralho desconhecido.`);

    const row = Object.fromEntries(DOCTRINE_APKG_FIELDS.map((field, fieldIndex) => [field, String(fields[fieldIndex] ?? "")])) as Record<DoctrineApkgField, string>;
    return { ...row, deck: deckName.split("::").map((part) => part.trim()).filter(Boolean) };
  });
}

/**
 * Validação sem efeitos colaterais para a prévia do APKG de doutrina.
 * Não presume slug, rota nem que uma estrutura seja artigo de lei.
 */
export function previewDoctrineImport(rows: DoctrineImportRow[]): DoctrineImportPreview {
  const issues: DoctrineImportIssue[] = [];
  const ids = new Set<string>();
  const topics = new Set<string>();
  const structures = new Set<string>();
  const orders: string[] = [];

  rows.forEach((row, index) => {
    const id = text(row, "IDQuestao");
    if (!UUID_V4.test(id)) issues.push({ row: index, field: "IDQuestao", message: "IDQuestao deve ser UUIDv4." });
    else if (ids.has(id.toLowerCase())) issues.push({ row: index, field: "IDQuestao", message: "IDQuestao duplicado." });
    else ids.add(id.toLowerCase());

    const topic = text(row, "assunto");
    if (!topic) issues.push({ row: index, field: "assunto", message: "Assunto é obrigatório para doutrina." });
    else topics.add(topic);

    const order = text(row, "ordem");
    if (!/^\d{3}$/.test(order)) issues.push({ row: index, field: "ordem", message: "Ordem de doutrina deve ter três dígitos globais." });
    else orders.push(order);

    if (!text(row, "pergunta")) issues.push({ row: index, field: "pergunta", message: "Pergunta é obrigatória." });
    if (!ANSWERS.has(text(row, "resposta").toLocaleLowerCase("pt-BR"))) issues.push({ row: index, field: "resposta", message: "Resposta deve ser Certo ou Errado." });

    const deckStructure = row.deck.slice(1).join("::").trim();
    const fieldStructure = text(row, "estrutura");
    const structure = deckStructure || fieldStructure;
    if (!structure) issues.push({ row: index, field: "deck", message: "A localização deve vir da hierarquia do baralho ou de estrutura." });
    else structures.add(structure);
  });

  return { rows, issues, topicCount: topics.size, structureCount: structures.size, orders: [...new Set(orders)].sort() };
}
