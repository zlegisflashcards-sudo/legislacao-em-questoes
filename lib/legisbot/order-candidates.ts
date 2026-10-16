import { parseQuestionOrder } from "@/lib/question-structure-consistency";

/** Hierarquia oficial da Ordem: exato → inciso/parágrafo/artigo superiores. */
export function legisBotOrderCandidates(ordem: string) {
  const received = ordem.trim();
  const legacyParts = received.split(".");
  // Formato antigo usado por APKGs já distribuídos:
  // artigo.letra_artigo.parágrafo.inciso. As letras intermediárias ausentes
  // são completadas sem modificar o endereço antigo armazenado no cartão.
  const normalized = legacyParts.length === 4
    ? [legacyParts[0], legacyParts[1], legacyParts[2], "0", legacyParts[3], "0"].join(".")
    : received;
  const parsed = parseQuestionOrder(normalized);
  if (!parsed) return [received];
  const parts = normalized.split(".");
  const candidates = [parts.join(".")];
  const add = (next: string[]) => { const value = next.join("."); if (!candidates.includes(value)) candidates.push(value); };
  if (parts[5] !== "0") add([...parts.slice(0, 5), "0"]);
  if (parts[4] !== "00") add([...parts.slice(0, 4), "00", "0"]);
  if (parts[3] !== "0") add([...parts.slice(0, 3), "0", "00", "0"]);
  if (parts[2] !== "00") add([parts[0], parts[1], "00", "0", "00", "0"]);
  if (parts[1] !== "0") add([parts[0], "0", "00", "0", "00", "0"]);
  return candidates;
}
