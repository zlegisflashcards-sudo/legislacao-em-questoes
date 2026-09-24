/** `artigo` continua sendo aceito para ler a base legada, mas não é criado pelo
 * editor de hierarquia. A numeração oficial permanece no campo `nome`. */
export type QuestionStructureType = "parte" | "livro" | "titulo" | "capitulo" | "secao" | "subsecao" | "artigo";
export type CreatableQuestionStructureType = Exclude<QuestionStructureType, "artigo">;
export const creatableQuestionStructureTypes: CreatableQuestionStructureType[] = ["parte", "livro", "titulo", "capitulo", "secao", "subsecao"];
export type QuestionStructureNode = { id: number; parent_id: number | null; tipo: QuestionStructureType; nome: string; ordem?: number };
export type StructureImportMapping = Record<string, number | "new">;
export type PlannedQuestionStructure = {
  key: string;
  parentKey: string | null;
  tipo: CreatableQuestionStructureType;
  nome: string;
  path: string;
  existingId: number | null;
  candidates: Array<{ id: number; nome: string }>;
  requiresMapping: boolean;
  mappingError: string | null;
};
export type QuestionDeckPlan = { line: number; structureKey: string | null; error: string | null };
export type StructureTxtIssue = { line: number; path: string; message: string };

const collator = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });

export function compareQuestionStructureNames<T extends { nome: string; ordem?: number }>(left: T, right: T) {
  const order = (Number(left.ordem) || 0) - (Number(right.ordem) || 0);
  return order || collator.compare(left.nome, right.nome);
}
export function normalizeQuestionStructureName(value: string) { return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR"); }

/** Sugestões são apenas para revisão humana: equivalência continua sendo exata. */
export function similarQuestionStructureName(left: string, right: string) {
  const comparable = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(" ").map((word) => /^\d+$/.test(word) ? String(Number(word)) : word === "i" ? "1" : word).join(" ");
  const a = comparable(left);
  const b = comparable(right);
  if (!a || !b || a === b) return a === b;
  const leftWords = new Set(a.split(" "));
  const rightWords = new Set(b.split(" "));
  const shared = [...leftWords].filter((word) => rightWords.has(word)).length;
  return a.includes(b) || b.includes(a) || shared >= Math.min(leftWords.size, rightWords.size);
}

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

/** Produz o mesmo caminho Deck::Subdeck consumido pelos importadores TXT e APKG. */
export function ankiPathForQuestionStructure(nodeId: number, lawDeckName: string, nodes: Array<Pick<QuestionStructureNode, "id" | "parent_id" | "nome">>) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const parts: string[] = [];
  const visited = new Set<number>();
  let current = byId.get(nodeId);
  while (current) {
    if (visited.has(current.id)) throw new Error("A estrutura possui um ciclo.");
    visited.add(current.id);
    parts.unshift(current.nome);
    current = current.parent_id === null ? undefined : byId.get(current.parent_id);
  }
  return [lawDeckName.trim(), ...parts].filter(Boolean).join("::");
}

export function allAnkiPathsForQuestionStructure(lawDeckName: string, nodes: QuestionStructureNode[]) {
  const children = new Map<number | null, QuestionStructureNode[]>();
  for (const node of nodes) children.set(node.parent_id, [...(children.get(node.parent_id) ?? []), node]);
  const ordered: QuestionStructureNode[] = [];
  const visit = (parentId: number | null) => {
    for (const node of [...(children.get(parentId) ?? [])].sort(compareQuestionStructureNames)) {
      ordered.push(node);
      visit(node.id);
    }
  };
  visit(null);
  return ordered.map((node) => ankiPathForQuestionStructure(node.id, lawDeckName, nodes));
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

export function planQuestionDeckStructure(rows: Array<{ line: number; deck: string[] }>, existing: QuestionStructureNode[], mappings: StructureImportMapping = {}) {
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
        const siblings: QuestionStructureNode[] = parentKey !== null && parentId === null ? [] : children.get(parentId) ?? [];
        const exact: QuestionStructureNode | undefined = siblings.find((item) => item.tipo === tipo && normalizeQuestionStructureName(item.nome) === normalizeQuestionStructureName(nome));
        const candidates = exact ? [] : siblings.filter((item) => item.tipo === tipo && similarQuestionStructureName(item.nome, nome)).map((item) => ({ id: item.id, nome: item.nome }));
        const selection = mappings[key];
        let found: QuestionStructureNode | undefined = exact;
        let mappingError: string | null = null;
        if (selection === "new") {
          if (exact) mappingError = `O caminho “${nome}” já possui uma estrutura equivalente neste pai.`;
          else found = undefined;
        } else if (typeof selection === "number") {
          const selected = candidates.find((item) => item.id === selection);
          if (!selected) mappingError = `O destino selecionado para “${nome}” não pertence a este caminho da lei.`;
          else found = siblings.find((item) => item.id === selected.id);
        }
        node = { key, parentKey, tipo, nome, path: path ? `${path} › ${nome}` : nome, existingId: found?.id ?? null, candidates, requiresMapping: !exact && candidates.length > 0 && selection === undefined, mappingError };
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
