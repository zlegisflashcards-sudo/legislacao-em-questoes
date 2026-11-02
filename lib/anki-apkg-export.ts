import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Deck, Note, Notetype, Package } from "ankipack";
import { ankiApkgFileName, stableAnkiGuid, stableAnkiId } from "./anki-apkg-identity";
import { ankiLastLegislativeUpdate } from "./law-anki-legislative-update";

// Os templates fazem parte do projeto para também existirem no runtime serverless.
const templateDirectory = join(process.cwd(), "public", "anki-templates");
const fieldNames = ["pergunta", "resposta", "justificativa", "assunto", "legislação", "titulo", "TotalArtigos", "ordem", "slug", "ultimaAlteracaoLegislativa", "IDQuestao", "legisbotUrl"];

type ExportLaw = { slug: string; titulo: string; ultima_alteracao_referencia?: string | null; houve_alteracao_legislativa?: boolean | null };
type ExportQuestion = { id: string; structure_id: number | null; pergunta: string; resposta: string; justificativa?: string | null; assunto?: string | null; legislacao?: string | null; titulo?: string | null; total_artigos?: number | null; ordem?: string | null; slug?: string | null; ultima_alteracao_legislativa?: string | null; created_at?: string | null };
type ExportStructure = { id: number; parent_id: number | null; nome: string };

let sqlJsPromise: Promise<Awaited<ReturnType<(typeof import("sql.js"))["default"]>>> | undefined;

function template4() {
  return {
    front: readFileSync(join(templateDirectory, "frente-certo-errado-4.0.txt"), "utf8"),
    back: readFileSync(join(templateDirectory, "verso-certo-errado-4.0.txt"), "utf8"),
    css: readFileSync(join(templateDirectory, "estilo-certo-errado-4.0.txt"), "utf8"),
  };
}

function structurePathResolver(structure: ExportStructure[]) {
  const nodes = new Map(structure.map((node) => [node.id, node]));
  const paths = new Map<number, string[]>();
  const rootPath: string[] = [];

  return (structureId: number | null) => {
    if (!structureId) return rootPath;
    const cached = paths.get(structureId);
    if (cached) return cached;

    const unresolved: ExportStructure[] = [];
    for (let node = nodes.get(structureId); node; node = node.parent_id ? nodes.get(node.parent_id) : undefined) {
      const knownPath = paths.get(node.id);
      if (knownPath) {
        const path = [...knownPath];
        for (const unresolvedNode of unresolved.reverse()) {
          path.push(unresolvedNode.nome);
          paths.set(unresolvedNode.id, [...path]);
        }
        return paths.get(structureId) ?? rootPath;
      }
      unresolved.push(node);
    }

    const path: string[] = [];
    for (const unresolvedNode of unresolved.reverse()) {
      path.push(unresolvedNode.nome);
      paths.set(unresolvedNode.id, [...path]);
    }
    return paths.get(structureId) ?? rootPath;
  };
}

function initializedSqlJs() {
  // Não contém dados da lei ou do usuário: este reuso só evita reinicializar
  // o runtime WASM enquanto a mesma instância serverless estiver quente.
  if (!sqlJsPromise) {
    const initialization = import("sql.js").then(({ default: initSqlJs }) => {
      // A função serverless preserva o arquivo físico rastreado pelo pnpm, mas o
      // resolvedor relativo ao bundle da rota não enxerga esse pacote. Este é o
      // mesmo caminho físico declarado no tracing do Next.
      const sqlWasmPath = join(process.cwd(), "node_modules", ".pnpm", "sql.js@1.14.2", "node_modules", "sql.js", "dist", "sql-wasm.wasm");
      return initSqlJs({ locateFile: (file) => file === "sql-wasm.wasm" ? sqlWasmPath : file });
    });
    const recoverableInitialization = initialization.catch((error) => {
      if (sqlJsPromise === recoverableInitialization) sqlJsPromise = undefined;
      throw error;
    });
    sqlJsPromise = recoverableInitialization;
  }
  return sqlJsPromise;
}

export async function buildLawApkg(law: ExportLaw, questions: ExportQuestion[], structure: ExportStructure[], options?: { fileName?: string; legisbotDestinations?: ReadonlyMap<string, string> }) {
  const template = template4();
  const notetype = new Notetype({ id: stableAnkiId("legis-certo-errado-4"), name: "1 - certo ou errado 4.0", fields: fieldNames.map((name) => ({ name })), css: template.css, templates: [{ name: "Certo ou Errado", questionFormat: template.front, answerFormat: template.back }] });
  const decks = new Map<string, Deck>();
  const pathForStructure = structurePathResolver(structure);
  const lastLegislativeUpdate = ankiLastLegislativeUpdate(law);
  const deckFor = (path: string[]) => {
    const name = [law.titulo, ...path].join("::");
    const existing = decks.get(name);
    if (existing) return existing;
    const deck = new Deck({ name, id: stableAnkiId(`deck:${law.slug}:${name}`), config: null });
    decks.set(name, deck);
    return deck;
  };

  for (const question of [...questions].sort((a, b) => String(a.ordem).localeCompare(String(b.ordem)) || String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")) || a.id.localeCompare(b.id))) {
    const pedagogicalFields = [question.pergunta, question.resposta, question.justificativa ?? "", question.assunto ?? "", question.legislacao ?? ""];
    if (pedagogicalFields.some((value) => /<img\b|\[sound:/i.test(value))) throw new Error(`A questão ${question.ordem ?? question.id} contém mídia. A exportação de mídia ainda não é suportada.`);
    // Campo 12 é mantido vazio para compatibilidade com o modelo 4.0 já
    // importado. O template novo resolve pelo IDQuestao, slug e ordem.
    deckFor(pathForStructure(question.structure_id)).addNote(new Note({ notetype, guid: stableAnkiGuid(law.slug, question.id), fields: [...pedagogicalFields, question.titulo ?? law.titulo, question.total_artigos?.toString() ?? "", question.ordem ?? "", question.slug ?? law.slug, lastLegislativeUpdate, question.id, ""] }));
  }

  const packageFile = new Package();
  for (const deck of decks.values()) packageFile.addDeck(deck);
  const bytes = await packageFile.toUint8Array(await initializedSqlJs());
  return { bytes, filename: options?.fileName ?? ankiApkgFileName(law.titulo), notes: questions.length, decks: [...decks.keys()] };
}

export async function exportLawApkg(slug: string) {
  const { listAdminQuestions } = await import("./admin-questoes-server");
  const { law, questions, structure, questionCount } = await listAdminQuestions(slug);
  if (!questions.length) throw new Error("Esta lei ainda não possui questões disponíveis para exportação.");
  const exported = await buildLawApkg(law, questions, structure);
  return { ...exported, found: questionCount, exported: exported.notes };
}

export async function summarizeLawApkgExport(slug: string) {
  const { listAdminQuestions } = await import("./admin-questoes-server");
  const { questions, questionCount } = await listAdminQuestions(slug);
  return { found: questionCount, exported: questions.length, complete: questionCount > 0 && questionCount === questions.length };
}

export async function exportLawContentApkg(slug: string) {
  const { listQuestionContent } = await import("./admin-questoes-server");
  const { law, questions, structure } = await listQuestionContent(slug);
  if (!questions.length) throw new Error("Esta lei ainda não possui questões disponíveis para exportação.");
  return buildLawApkg(law, questions, structure);
}

export { ankiApkgFileName as apkgFileName, stableAnkiGuid as stableGuid } from "./anki-apkg-identity";
