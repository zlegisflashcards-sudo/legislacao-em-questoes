export type QuestionStructureType = "titulo" | "capitulo" | "secao" | "subsecao";
export type QuestionStructureNode = { id: number; parent_id: number | null; tipo: QuestionStructureType; nome: string };
export type PlannedQuestionStructure = { key: string; parentKey: string | null; tipo: QuestionStructureType; nome: string; path: string; existingId: number | null };
export type QuestionDeckPlan = { line: number; structureKey: string | null; error: string | null };

const collator = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });

export function compareQuestionStructureNames<T extends { nome: string }>(left: T, right: T) { return collator.compare(left.nome, right.nome); }
export function normalizeQuestionStructureName(value: string) { return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR"); }

export function inferQuestionStructureType(value: string): QuestionStructureType | null {
  const prefix = value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("pt-BR");
  if (/^titulo\b/.test(prefix)) return "titulo";
  if (/^capitulo\b/.test(prefix)) return "capitulo";
  if (/^secao\b/.test(prefix)) return "secao";
  if (/^subsecao\b/.test(prefix)) return "subsecao";
  return null;
}

function validParent(type: QuestionStructureType, parentType: QuestionStructureType | null) {
  return (type === "titulo" && parentType === null)
    || (type === "capitulo" && (parentType === null || parentType === "titulo"))
    || (type === "secao" && parentType === "capitulo")
    || (type === "subsecao" && parentType === "secao");
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
      if (!validParent(tipo, parentType)) { error = `Hierarquia estrutural inválida em “${nome}”.`; break; }
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
