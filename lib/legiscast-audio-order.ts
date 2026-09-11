export type LegiscastAudioOrderable = {
  id: string;
  titulo: string | null;
  ordem: number | null;
  created_at: string | null;
};

const titleCollator = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });

function manualOrder(audio: LegiscastAudioOrderable) {
  const order = Number(audio.ordem);
  return Number.isSafeInteger(order) && order > 0 ? order : null;
}

/** A ordem manual positiva prevalece; os demais áudios seguem o título natural. */
export function sortLegiscastAudios<T extends LegiscastAudioOrderable>(audios: T[]): T[] {
  return [...audios].sort((left, right) => {
    const leftManual = manualOrder(left);
    const rightManual = manualOrder(right);
    if (leftManual !== null && rightManual === null) return -1;
    if (leftManual === null && rightManual !== null) return 1;
    if (leftManual !== null && rightManual !== null && leftManual !== rightManual) return leftManual - rightManual;

    const title = titleCollator.compare(left.titulo ?? "", right.titulo ?? "");
    if (title) return title;
    const createdAt = String(left.created_at ?? "").localeCompare(String(right.created_at ?? ""));
    if (createdAt) return createdAt;
    return left.id.localeCompare(right.id);
  });
}
