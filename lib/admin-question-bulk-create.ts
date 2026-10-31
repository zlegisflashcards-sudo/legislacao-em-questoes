import { parseQuestionDraft, type QuestionDraft } from "@/lib/admin-questoes";

export type BulkQuestionPasteRow = Omit<Pick<QuestionDraft, "pergunta" | "resposta" | "justificativa" | "assunto" | "legislacao" | "ordem">, "resposta"> & { resposta: string };

const requiredHeaders = ["pergunta", "resposta", "justificativa", "assunto", "legislacao", "ordem"] as const;

function normalizedHeader(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]+/g, " ").trim();
}

function fieldForHeader(value: string): (typeof requiredHeaders)[number] | null {
  const header = normalizedHeader(value);
  if (header === "pergunta") return "pergunta";
  if (header === "resposta" || header === "gabarito") return "resposta";
  if (header === "justificativa") return "justificativa";
  if (header === "referencia legal" || header === "referencia" || header === "assunto") return "assunto";
  if (header === "legislacao") return "legislacao";
  if (header === "ordem") return "ordem";
  return null;
}

function parseDelimitedLine(line: string, delimiter: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === "\\" && line[index + 1] === delimiter) { current += delimiter; index += 1; }
    else if (character === '"') {
      if (quoted && line[index + 1] === '"') { current += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === delimiter && !quoted) { cells.push(current.trim()); current = ""; }
    else current += character;
  }
  if (quoted) throw new Error("Há aspas não fechadas na tabela colada.");
  cells.push(current.trim());
  return cells;
}

function parseMarkdownLine(line: string) {
  const trimmed = line.trim();
  return parseDelimitedLine(trimmed.replace(/^\|/, "").replace(/\|$/, ""), "|");
}

function isMarkdownSeparator(cells: string[]) {
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function normalizedAnswer(value: string) {
  const answer = value.trim().toLocaleLowerCase("pt-BR");
  if (answer === "certo") return "Certo";
  if (answer === "errado") return "Errado";
  return value.trim();
}

/** Lê a tabela colada do Excel, Sheets, CSV, ponto e vírgula ou Markdown. */
export function parseBulkQuestionPaste(value: unknown): BulkQuestionPasteRow[] {
  if (typeof value !== "string" || !value.trim()) throw new Error("Cole uma tabela com cabeçalho e ao menos uma questão.");
  const lines = value.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) throw new Error("A tabela precisa conter cabeçalho e ao menos uma questão.");
  const markdown = /^\s*\|.*\|\s*$/.test(lines[0]);
  const delimiter = markdown ? "|" : lines.some((line) => line.includes("\t")) ? "\t" : lines[0].includes(";") ? ";" : ",";
  const readLine = markdown ? parseMarkdownLine : (line: string) => parseDelimitedLine(line, delimiter);
  const headers = readLine(lines[0]).map(fieldForHeader);
  if (headers.some((header) => header === null) || new Set(headers).size !== headers.length || requiredHeaders.some((header) => !headers.includes(header))) {
    throw new Error("Use as colunas: Pergunta, Resposta, Justificativa, Referência Legal, Legislação e Ordem.");
  }
  const rows = lines.slice(1).filter((line) => !markdown || !isMarkdownSeparator(readLine(line)));
  if (rows.length > 100) throw new Error("O lote pode conter no máximo 100 questões por vez.");
  return rows.map((line, index) => {
    const cells = readLine(line);
    const lineNumber = lines.indexOf(line) + 1;
    if (cells.length !== headers.length) throw new Error(`Linha ${lineNumber}: a quantidade de colunas não corresponde ao cabeçalho.`);
    const row: Record<string, string> = {};
    headers.forEach((header, cellIndex) => { if (header) row[header] = cells[cellIndex] ?? ""; });
    return {
      pergunta: row.pergunta,
      resposta: normalizedAnswer(row.resposta),
      justificativa: row.justificativa,
      assunto: row.assunto,
      legislacao: row.legislacao,
      ordem: row.ordem,
    };
  });
}

export function parseBulkQuestionPasteDrafts(value: unknown, defaults: { structure_id: unknown; titulo: unknown; total_artigos: unknown }) {
  return parseBulkQuestionPaste(value).map((row, index) => {
    try {
      return parseQuestionDraft({ ...defaults, ...row });
    } catch (error) {
      throw new Error(`Linha ${index + 2}: ${error instanceof Error ? error.message : "dados inválidos."}`);
    }
  });
}
