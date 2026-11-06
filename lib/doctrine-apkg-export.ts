import { Deck, Note, Notetype, Package } from "ankipack";
import { join } from "node:path";
import { ankiApkgFileName, stableAnkiId } from "@/lib/anki-apkg-identity";
import { DOCTRINE_APKG_FIELDS, type DoctrineImportRow } from "@/lib/doctrine-import-contract";

/** O modelo novo preserva os doze campos entregues e adiciona somente o slug
 * operacional. Não há legisbotUrl: o link usa UUID, slug e Ordem. */
export const DOCTRINE_ANKI_MODEL_ID = 2316326386;
export const doctrineAnkiFieldNames = DOCTRINE_APKG_FIELDS;

export function doctrineAnkiUrl(slug: string, id: string, ordem: string) {
  return `https://www.legisflashcards.com.br/doutrina/${encodeURIComponent(slug)}?questao=${encodeURIComponent(id)}&ordem=${encodeURIComponent(ordem)}`;
}

/** Existing pilot APKG notes use the question UUID itself as their Anki GUID. */
export function doctrineAnkiGuid(questionId: string) { return questionId; }

function template(slug: string) {
  const front = `<main class="lf"><h1>{{titulo}}</h1><p class="path">{{Deck}}</p><article>{{pergunta}}</article><p class="hint">Julgue a assertiva e revele a resposta no Anki.</p></main>`;
  const back = `{{FrontSide}}<hr id=answer><p><strong>Gabarito:</strong> {{resposta}}</p><section><h2>Comentário do professor</h2>{{justificativa}}</section>{{#resumo}}<section><h2>{{assunto}}</h2>{{resumo}}</section>{{/resumo}}<p><a href="https://www.legisflashcards.com.br/doutrina/{{slug}}?questao={{IDQuestao}}&ordem={{ordem}}">Aprofundar neste tópico</a></p>`;
  const css = `.card{font-family:Arial,sans-serif;background:#071426;color:#e8eef8;font-size:18px;text-align:left}.lf{max-width:760px;margin:auto;padding:20px}.lf h1{font-size:20px}.path,.hint{color:#9fb2c9;font-size:13px}.lf article,section{background:#fff;color:#172a42;border-radius:12px;padding:18px;margin:14px 0}a{display:block;background:#eff6ff;color:#075bc1;padding:12px;border-radius:10px;font-weight:bold;text-decoration:none}`;
  return { front, back: back.replace("{{slug}}", encodeURIComponent(slug)), css };
}

export async function buildDoctrineApkg(input: { slug: string; titulo: string; notes: DoctrineImportRow[]; fileName?: string }) {
  const { front, back, css } = template(input.slug);
  const notetype = new Notetype({ id: DOCTRINE_ANKI_MODEL_ID, name: "Legis Flashcards · Doutrina · Piloto v1", fields: doctrineAnkiFieldNames.map((name) => ({ name })), css, templates: [{ name: "Julgar assertiva", questionFormat: front, answerFormat: back }] });
  const decks = new Map<string, Deck>();
  const deckFor = (structure: string) => {
    const name = [input.titulo, structure].filter(Boolean).join("::");
    const found = decks.get(name); if (found) return found;
    const deck = new Deck({ name, id: stableAnkiId(`deck:${input.slug}:${name}`), config: null }); decks.set(name, deck); return deck;
  };
  for (const note of [...input.notes].sort((a, b) => a.ordem.localeCompare(b.ordem) || a.IDQuestao.localeCompare(b.IDQuestao))) {
    const pedagogical = [note.pergunta, note.resposta, note.justificativa, note.resumo];
    if (pedagogical.some((value) => /<img\b|\[sound:/i.test(value))) throw new Error(`A questão ${note.IDQuestao} contém mídia não suportada.`);
    const structure = note.deck.slice(1).join("::") || note.estrutura;
    deckFor(structure).addNote(new Note({ notetype, guid: doctrineAnkiGuid(note.IDQuestao), fields: [note.IDQuestao, note.titulo, structure, note.assunto, note.ordem, note.totalAssuntos, note.pergunta, note.resposta, note.justificativa, note.resumo, note.referencia, note.versao] }));
  }
  const pkg = new Package(); for (const deck of decks.values()) pkg.addDeck(deck);
  const { default: initSqlJs } = await import("sql.js");
  const wasm = join(process.cwd(), "node_modules", ".pnpm", "sql.js@1.14.2", "node_modules", "sql.js", "dist", "sql-wasm.wasm");
  const bytes = await pkg.toUint8Array(await initSqlJs({ locateFile: (file) => file === "sql-wasm.wasm" ? wasm : file }));
  return { bytes, filename: input.fileName ?? ankiApkgFileName(input.titulo), notes: input.notes.length, decks: [...decks.keys()] };
}
