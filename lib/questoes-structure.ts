/** `artigo` continua sendo aceito para ler a base legada, mas não é criado pelo
 * editor de hierarquia. A numeração oficial permanece no campo `nome`. */
export type QuestionStructureType = "parte" | "livro" | "titulo" | "capitulo" | "secao" | "subsecao" | "artigo";
export type CreatableQuestionStructureType = Exclude<QuestionStructureType, "artigo">;
export const creatableQuestionStructureTypes: CreatableQuestionStructureType[] = ["parte", "livro", "titulo", "capitulo", "secao", "subsecao"];
export type QuestionStructureNode = { id: number; parent_id: number | null; tipo: QuestionStructureType; nome: string; ordem?: number };
export type PlannedQuestionStructure = { key: string; parentKey: string | null; tipo: CreatableQuestionStructureType; nome: string; path: string; existingId: number | null };
export type QuestionDeckPlan = { line: number; structureKey: string | null; error: string | null };
export type StructureTxtIssue = { line: number; path: string; message: string };

const collator = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });

export function compareQuestionStructureNames<T extends { nome: string; ordem?: number }>(left: T, right: T) {
  const order = (Number(left.ordem) || 0) - (Number(right.ordem) || 0);
  return order || collator.compare(left.nome, right.nome);
}
export function normalizeQuestionStructureName(value: string) { return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR"); }

export function inferQuestionStructureType(value: string): CreatableQuestionStructureType | null {
  const prefix = value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("pt-BR");
  if (/^parte\b/.test(prefix)) return "parte";
  if (/^livro\b/.test(prefix)) return "livro";
  if (/^titulo\b/.test(prefix)) return "titulo";
  if (/^capitulo\b/.test(prefix)) return "capitulo";
  if (/^secao\b/.test(prefix)) return "secao";
  if (/^subsecao\b/.test(prefix)) return "subsecao";
  return null;
}

/**
 * A legislação não precisa declarar níveis vazios: um nível pode ser raiz ou
 * filho de qualquer nível oficialmente superior. Nunca aceita ciclos, irmãos
 * como pai ou o tipo legado `artigo` como contêiner.
 */
export function validQuestionStructureParent(type: CreatableQuestionStructureType, parentType: QuestionStructureType | null) {
  if (parentType === null) return true;
  const rank: Record<QuestionStructureType, number> = { parte: 0, livro: 1, titulo: 2, capitulo: 3, secao: 4, subsecao: 5, artigo: 6 };
  return parentType !== "artigo" && rank[parentType] < rank[type];
}

export function parseQuestionStructureTxt(value: string) {
  const rows: Array<{ line: number; deck: string[] }> = [];
  const issues: StructureTxtIssue[] = [];
  const known = new Map<string, number>();
  const lines = value.replace(/^\uFEFF/, "").split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index].trim();
    if (!raw) continue;
    const line = index + 1;
    const segments = raw.split("::").map((segment) => segment.trim());
    if (segments.some((segment) => !segment)) { issues.push({ line, path: raw, message: "O caminho possui um nível vazio." }); continue; }
    const key = segments.map(normalizeQuestionStructureName).join("\u0000");
    const firstLine = known.get(key);
    if (firstLine) { issues.push({ line, path: raw, message: `Caminho duplicado; ele já foi informado na linha ${firstLine}.` }); continue; }
    known.set(key, line);
    rows.push({ line, deck: ["Estrutura", ...segments] });
  }
  if (!rows.length && !issues.length) issues.push({ line: 0, path: "", message: "O TXT está vazio." });
  return { rows, issues };
}

export function planQuestionDeckStructure(rows: Array<{ line: number; deck: string[] }>, existing: QuestionStructureNode[]) {
  const planned = new Map<string, PlannedQuestionStructure>();
  const deckPlans: QuestionDeckPlan[] = [];
  const children = new Map<number | null, QuestionStructureNode[]>();
  for (const node of existing) children.set(node.parent_id, [...(children.get(node.parent_id) ?? []), node]);

  for (const row of rows) {
    const segments = row.deck.slice(1);
    if (!segments.length) { deckPlans.push({ line: row.line, structureKey: null, error: null }); continue; }
    let parentKey: string | null = null;
    let parentId: number | null = null;
    let parentType: QuestionStructureType | null = null;
    let path = "";
    let error: string | null = null;

    for (const segment of segments) {
      const nome = segment.trim();
      const tipo = inferQuestionStructureType(nome);
      if (!tipo) { error = `Tipo estrutural não reconhecido em “${nome}”.`; break; }
      if (!validQuestionStructureParent(tipo, parentType)) { error = `Hierarquia estrutural inválida em “${nome}”.`; break; }
      const key: string = `${parentKey ?? "raiz"}\u0000${tipo}\u0000${normalizeQuestionStructureName(nome)}`;
      let node = planned.get(key);
      if (!node) {
        const found: QuestionStructureNode | undefined = parentKey === null ? (children.get(null) ?? []).find((item) => item.tipo === tipo && normalizeQuestionStructureName(item.nome) === normalizeQuestionStructureName(nome)) : parentId === null ? undefined : (children.get(parentId) ?? []).find((item) => item.tipo === tipo && normalizeQuestionStructureName(item.nome) === normalizeQuestionStructureName(nome));
        node = { key, parentKey, tipo, nome, path: path ? `${path} › ${nome}` : nome, existingId: found?.id ?? null };
        planned.set(key, node);
      }
      parentKey = key;
      parentId = node.existingId;
      parentType = tipo;
      path = node.path;
    }
    deckPlans.push({ line: row.line, structureKey: error ? null : parentKey, error });
  }
  return { nodes: [...planned.values()], decks: deckPlans };
}
