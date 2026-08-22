import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Deck, Note, Notetype, Package } from "ankipack";
import { ankiApkgFileName, stableAnkiGuid, stableAnkiId } from "./anki-apkg-identity";

// Os templates fazem parte do projeto para também existirem no runtime serverless.
const templateDirectory = join(process.cwd(), "public", "anki-templates");
const fieldNames = ["pergunta", "resposta", "justificativa", "assunto", "legislação", "titulo", "TotalArtigos", "ordem", "slug", "ultimaAlteracaoLegislativa"];

type ExportLaw = { slug: string; titulo: string };
type ExportQuestion = { id: string; structure_id: number | null; pergunta: string; resposta: string; justificativa?: string | null; assunto?: string | null; legislacao?: string | null; titulo?: string | null; total_artigos?: number | null; ordem?: string | null; slug?: string | null; ultima_alteracao_legislativa?: string | null; created_at?: string | null };
type ExportStructure = { id: number; parent_id: number | null; nome: string };

function template4() {
  return {
    front: readFileSync(join(templateDirectory, "frente-certo-errado-4.0.txt"), "utf8"),
    back: readFileSync(join(templateDirectory, "verso-certo-errado-4.0.txt"), "utf8"),
    css: readFileSync(join(templateDirectory, "estilo-certo-errado-4.0.txt"), "utf8"),
  };
}

function structurePath(structure: ExportStructure[], structureId: number | null) {
  const nodes = new Map(structure.map((node) => [node.id, node]));
  const path: string[] = [];
  for (let node = structureId ? nodes.get(structureId) : undefined; node; node = node.parent_id ? nodes.get(node.parent_id) : undefined) path.unshift(node.nome);
  return path;
}

export async function buildLawApkg(law: ExportLaw, questions: ExportQuestion[], structure: ExportStructure[]) {
  const template = template4();
  const notetype = new Notetype({ id: stableAnkiId("legis-certo-errado-4"), name: "1 - certo ou errado 4.0", fields: fieldNames.map((name) => ({ name })), css: template.css, templates: [{ name: "Certo ou Errado", questionFormat: template.front, answerFormat: template.back }] });
  const decks = new Map<string, Deck>();
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
    deckFor(structurePath(structure, question.structure_id)).addNote(new Note({ notetype, guid: stableAnkiGuid(law.slug, question.id), fields: [...pedagogicalFields, question.titulo ?? law.titulo, question.total_artigos?.toString() ?? "", question.ordem ?? "", question.slug ?? law.slug, question.ultima_alteracao_legislativa ?? ""] }));
  }

  const packageFile = new Package();
  for (const deck of decks.values()) packageFile.addDeck(deck);
  const { default: initSqlJs } = await import("sql.js");
  const bytes = await packageFile.toUint8Array(await initSqlJs());
  return { bytes, filename: ankiApkgFileName(law.titulo), notes: questions.length, decks: [...decks.keys()] };
}

export async function exportLawApkg(slug: string) {
  const { listAdminQuestions } = await import("./admin-questoes-server");
  const { law, questions, structure } = await listAdminQuestions(slug);
  if (!questions.length) throw new Error("Esta lei ainda não possui questões disponíveis para exportação.");
  return buildLawApkg(law, questions, structure);
}

export async function exportLawContentApkg(slug: string) {
  const { listQuestionContent } = await import("./admin-questoes-server");
  const { law, questions, structure } = await listQuestionContent(slug);
  if (!questions.length) throw new Error("Esta lei ainda não possui questões disponíveis para exportação.");
  return buildLawApkg(law, questions, structure);
}

export { ankiApkgFileName as apkgFileName, stableAnkiGuid as stableGuid } from "./anki-apkg-identity";
