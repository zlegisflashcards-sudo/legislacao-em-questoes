import type { ImportedQuestion, ImportIssue } from "@/lib/imported-question";

export type AnkiRow = ImportedQuestion;
export type { ImportedQuestion, ImportIssue } from "@/lib/imported-question";

type TsvRecord = { line: number; fields: string[] };

function tsv(source: string) {
  const records: TsvRecord[] = [];
  let fields: string[] = [];
  let field = "";
  let quoted = false;
  let line = 1;
  let recordLine = 1;
  const finish = () => {
    fields.push(field);
    if (fields.some((value) => value !== "")) records.push({ line: recordLine, fields });
    fields = [];
    field = "";
  };
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (char === '"') {
      if (quoted && source[i + 1] === '"') { field += '"'; i += 1; } else quoted = !quoted;
      continue;
    }
    if (char === "\t" && !quoted) { fields.push(field); field = ""; continue; }
    if (char === "\n") {
      if (quoted) field += "\n";
      else { finish(); recordLine = line + 1; }
      line += 1;
      continue;
    }
    field += char;
  }
  if (field || fields.length) finish();
  return records;
}

function headerColumn(headers: string[], name: string) {
  const match = headers.find((header) => new RegExp(`^#${name} column:(\\d+)$`, "i").test(header))?.match(/:(\d+)$/);
  const column = match ? Number(match[1]) : NaN;
  return Number.isSafeInteger(column) && column > 0 ? column - 1 : null;
}

export function normalizeStructure(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
}

export function parseAnkiTxt(source: string) {
  const records = tsv(source.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n"));
  const headers = records.filter((record) => record.fields.length === 1 && record.fields[0].startsWith("#")).map((record) => record.fields[0]);
  if (!headers.includes("#separator:tab")) throw new Error("O arquivo precisa declarar #separator:tab.");

  // Exportações do Anki podem antepor colunas de metadados (note type, deck e tags).
  // Os cabeçalhos informam essas posições; os dez campos pedagógicos vêm depois.
  const deckColumn = headerColumn(headers, "deck") ?? 0;
  const metadataColumns = [headerColumn(headers, "notetype"), headerColumn(headers, "deck"), headerColumn(headers, "tags")].filter((column): column is number => column !== null);
  const firstPedagogicalColumn = metadataColumns.length ? Math.max(...metadataColumns) + 1 : 1;
  const rows: AnkiRow[] = [];
  const issues: ImportIssue[] = [];

  for (const record of records) {
    const columns = record.fields;
    if (columns.length === 1 && columns[0].startsWith("#")) continue;
    const deck = columns[deckColumn]?.split("::").map((value) => value.trim()).filter(Boolean) ?? [];
    const fields = columns.slice(firstPedagogicalColumn);
    if (fields.length !== 10 && fields.length !== 11) {
      issues.push({ line: record.line, deck, ordem: fields[5], pergunta: fields[0], field: "colunas", received: String(columns.length), expected: "11 ou 12 colunas", message: `Quantidade de colunas inválida: recebidas ${columns.length}; esperadas 11 ou 12.` });
      continue;
    }

    const [pergunta, resposta, justificativa, assunto, legislacao, ordem, titulo, totalArtigos, slug, ultimaAlteracaoLegislativa] = fields;
    const answer = resposta.trim().toLocaleLowerCase("pt-BR");
    if (answer !== "certo" && answer !== "errado") {
      issues.push({ line: record.line, deck, ordem, pergunta, field: "resposta", received: resposta, expected: "Certo ou Errado", message: `Resposta inválida: “${resposta}”. Esperado: “Certo” ou “Errado”.` });
      continue;
    }
    if (!pergunta.trim()) {
      issues.push({ line: record.line, deck, ordem, field: "pergunta", received: pergunta, expected: "Pergunta não vazia", message: "Pergunta vazia." });
      continue;
    }
    rows.push({ line: record.line, deck, pergunta, resposta: answer === "certo" ? "Certo" : "Errado", justificativa, assunto, legislacao, ordem, titulo, total_artigos: totalArtigos, slug: slug.trim(), ultima_alteracao_legislativa: ultimaAlteracaoLegislativa });
  }
  return { rows, issues, headers: new Set(headers) };
}

export function effectiveAnkiSlug(value: string, selected: string) { return value.trim() || selected; }

export function validateImportSlug(rows: AnkiRow[], selected: string) {
  const slugs = [...new Set(rows.map((row) => row.slug).filter(Boolean))];
  const different = slugs.find((value) => value !== selected);
  return { slugs: slugs.length ? slugs : [selected], valid: !different, message: different ? `O arquivo pertence à legislação ${different}, mas a legislação selecionada é ${selected}.` : null };
}

export function structureIdForDeck(deck: string[], nodes: { id: number; parent_id: number | null; nome: string }[]) {
  let parent: number | null = null;
  for (const segment of deck.slice(1)) {
    const normalized = normalizeStructure(segment);
    const found = nodes.find((node) => node.parent_id === parent && normalizeStructure(node.nome) === normalized);
    if (!found) return null;
    parent = found.id;
  }
  return parent;
}
