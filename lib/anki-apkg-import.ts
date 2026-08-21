import { unzipSync } from "fflate";
import type { ImportedQuestion, ImportIssue } from "@/lib/imported-question";

type ApkgModel = { name: string; flds: Array<{ name: string }> };
type ApkgDeck = { name: string };
type ApkgRow = [id: number, mid: number, flds: string, tags: string];

export type ApkgMedia = { name: string; referenced: boolean };
export type ApkgParseResult = {
  rows: ImportedQuestion[];
  issues: ImportIssue[];
  rootDecks: string[];
  subdecks: string[];
  notes: number;
  cards: number;
  recognizedModels: string[];
  unrecognizedModels: Array<{ name: string; fields: string[]; notes: number }>;
  media: ApkgMedia[];
  tags: string[];
};

const required = ["pergunta", "resposta", "justificativa", "assunto", "legislacao", "ordem", "titulo", "slug", "ultimaalteracaolegislativa", "totalartigos"];
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/gi, "").toLowerCase();

function fieldMap(model: ApkgModel) {
  return new Map(model.flds.map((field, index) => [normalize(field.name), index]));
}

function deckForNote(noteId: number, cardDecks: Map<number, number[]>, decks: Record<string, ApkgDeck>) {
  const did = cardDecks.get(noteId)?.[0];
  const name = did === undefined ? "" : decks[String(did)]?.name ?? "";
  return name.split("::").map((part) => part.trim()).filter(Boolean);
}

export async function parseLegisApkg(source: Uint8Array): Promise<ApkgParseResult> {
  let archive: Record<string, Uint8Array>;
  try { archive = unzipSync(source); } catch { throw new Error("APKG não é um ZIP válido."); }
  const modernCollection = archive["collection.anki21b"];
  const collection = modernCollection ? (await import("fzstd")).decompress(modernCollection) : archive["collection.anki21"] ?? archive["collection.anki2"];
  if (!collection) throw new Error("APKG não possui collection.anki21b, collection.anki21 nem collection.anki2.");
  const mediaManifest = archive.media;
  // Carregamento tardio: este módulo só é avaliado no Node quando um APKG é recebido.
  const { default: initSqlJs } = await import("sql.js");
  // Como sql.js é externo ao bundle, seu runtime Node localiza sql-wasm.wasm no próprio dist.
  const SQL = await initSqlJs();
  const database = new SQL.Database(collection);
  try {
    const hasModernSchema = (database.exec("select name from sqlite_master where type = 'table' and name = 'notetypes'")[0]?.values.length ?? 0) > 0;
    let models: Record<string, ApkgModel>;
    let decks: Record<string, ApkgDeck>;
    if (hasModernSchema) {
      models = {};
      const fieldsByModel = new Map<number, Array<{ name: string }>>();
      for (const [modelId, name] of database.exec("select ntid,name from fields order by ntid,ord")[0]?.values ?? []) {
        fieldsByModel.set(Number(modelId), [...(fieldsByModel.get(Number(modelId)) ?? []), { name: String(name) }]);
      }
      for (const [modelId, name] of database.exec("select id,name from notetypes")[0]?.values ?? []) models[String(modelId)] = { name: String(name), flds: fieldsByModel.get(Number(modelId)) ?? [] };
      decks = Object.fromEntries((database.exec("select id,name from decks")[0]?.values ?? []).map(([deckId, name]) => [String(deckId), { name: String(name).replace(/\u001f/g, "::") }]));
    } else {
      const col = database.exec("select models,decks from col limit 1")[0]?.values[0];
      if (!col) throw new Error("Collection SQLite inválida.");
      models = JSON.parse(String(col[0])) as Record<string, ApkgModel>;
      decks = JSON.parse(String(col[1])) as Record<string, ApkgDeck>;
    }
    const notes = database.exec("select id,mid,flds,tags from notes")[0]?.values ?? [];
    const cards = database.exec("select nid,did from cards")[0]?.values ?? [];
    const cardDecks = new Map<number, number[]>();
    for (const [nid, did] of cards) cardDecks.set(Number(nid), [...(cardDecks.get(Number(nid)) ?? []), Number(did)]);
    const rows: ImportedQuestion[] = [];
    const issues: ImportIssue[] = [];
    const recognizedModels = new Set<string>();
    const unrecognized = new Map<number, number>();
    const tags = new Set<string>();
    for (const [id, mid, rawFields, rawTags] of notes as unknown as ApkgRow[]) {
      rawTags.split(/\s+/).filter(Boolean).forEach((tag) => tags.add(tag));
      const model = models[String(mid)];
      if (!model) { issues.push({ line: id, deck: deckForNote(id, cardDecks, decks), field: "modelo", received: String(mid), message: "Note type não encontrado na collection." }); continue; }
      const fields = fieldMap(model);
      // A Etapa A reconhece somente a note pedagógica Certo/Errado 4.0.
      // Outros modelos Legis (cloze/especial) ficam explícitos na prévia para etapa futura.
      const compatible = required.every((name) => fields.has(name)) && normalize(model.name).includes("certoouerrado");
      if (!compatible) { unrecognized.set(mid, (unrecognized.get(mid) ?? 0) + 1); continue; }
      const values = rawFields.split("\u001f");
      const value = (name: string) => { const index = fields.get(name); return index === undefined ? "" : values[index] ?? ""; };
      const answer = value("resposta").trim().toLocaleLowerCase("pt-BR");
      if (answer !== "certo" && answer !== "errado") { issues.push({ line: id, deck: deckForNote(id, cardDecks, decks), ordem: value("ordem"), pergunta: value("pergunta"), field: "resposta", received: value("resposta"), expected: "Certo ou Errado", message: `Resposta inválida: “${value("resposta")}”. Esperado: “Certo” ou “Errado”.` }); continue; }
      if (!value("pergunta").trim()) { issues.push({ line: id, deck: deckForNote(id, cardDecks, decks), ordem: value("ordem"), field: "pergunta", received: value("pergunta"), expected: "Pergunta não vazia", message: "Pergunta vazia." }); continue; }
      recognizedModels.add(model.name);
      rows.push({
        line: id, deck: deckForNote(id, cardDecks, decks), pergunta: value("pergunta"), resposta: answer === "certo" ? "Certo" : "Errado",
        justificativa: value("justificativa"), assunto: value("assunto"), legislacao: value("legislacao"), ordem: value("ordem"), titulo: value("titulo"), total_artigos: value("totalartigos"), slug: value("slug").trim(), ultima_alteracao_legislativa: value("ultimaalteracaolegislativa"),
      });
    }
    // O formato atual do Anki armazena a lista de mídia como protobuf compactado.
    // A exportação atual rejeita mídia explicitamente; mantenha a leitura legada
    // para os APKGs antigos já suportados sem confundir o conteúdo pedagógico.
    const mediaNames = !modernCollection && mediaManifest ? Object.values(JSON.parse(new TextDecoder().decode(mediaManifest)) as Record<string, string>) : [];
    const allHtml = rows.map((row) => `${row.pergunta}\n${row.justificativa}\n${row.legislacao}`).join("\n");
    const roots = [...new Set(rows.map((row) => row.deck[0]).filter(Boolean))];
    return {
      rows, issues, rootDecks: roots, subdecks: [...new Set(rows.map((row) => row.deck.slice(1).join("::")).filter(Boolean))], notes: notes.length, cards: cards.length,
      recognizedModels: [...recognizedModels], unrecognizedModels: [...unrecognized].map(([mid, count]) => ({ name: models[String(mid)]?.name ?? "Desconhecido", fields: models[String(mid)]?.flds.map((field) => field.name) ?? [], notes: count })),
      media: mediaNames.map((name) => ({ name, referenced: allHtml.includes(name) })), tags: [...tags],
    };
  } finally { database.close(); }
}
