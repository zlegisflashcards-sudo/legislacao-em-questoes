import type { DoctrineTransferPayload } from "@/lib/doctrine-import-contract";

export type DoctrinePreview = { slug: string; titulo: string; tipoConteudo: "doutrina"; questions: number; topics: number; structures: { nome: string; ordem: number }[] };
export type DoctrineAction = "previsualizar" | "importar";
export type DoctrineFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export function parseDoctrineTransfer(text: string): DoctrineTransferPayload {
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== "object") throw new Error("O arquivo não contém uma transferência de doutrina válida.");
  return value as DoctrineTransferPayload;
}

export async function requestDoctrineAction(fetchImpl: DoctrineFetch, action: DoctrineAction, payload: DoctrineTransferPayload, slug: string, ordem: number) {
  const response = await fetchImpl("/api/admin/doutrina", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, payload, slug, ordem }),
  });
  const result = await response.json().catch(() => ({})) as { error?: unknown; preview?: DoctrinePreview; imported?: unknown };
  if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : `Não foi possível ${action} a doutrina (HTTP ${response.status}).`);
  return result;
}
