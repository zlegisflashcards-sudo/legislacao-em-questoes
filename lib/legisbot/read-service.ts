import type { LegisBotComentario } from "../legisbot-comentario";

export type LegisBotReadOutcome =
  | { kind: "completed"; item: LegisBotComentario }
  | { kind: "processing"; item: LegisBotComentario }
  | { kind: "not_found" };

export async function readLegisBotComment(
  find: () => Promise<LegisBotComentario | null>,
): Promise<LegisBotReadOutcome> {
  const item = await find();
  if (item?.status === "concluido" && item.comentario?.trim()) {
    return { kind: "completed", item };
  }
  if (item?.status === "processando") {
    return { kind: "processing", item };
  }
  return { kind: "not_found" };
}
