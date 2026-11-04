import "server-only";

import { createSupabaseUserClient, getSupabaseServerClient } from "@/lib/supabase-server";

export const shortcutColors = ["azul", "verde", "lilas", "amarelo", "coral", "turquesa"] as const;
export type ShortcutColor = (typeof shortcutColors)[number];
export type StudentShortcut = { leiId: number; slug: string; titulo: string; recorteId: string | null; recorteNome: string | null; cor: ShortcutColor; temAcesso: boolean };
export type StudentShortcutSelection = { id: string; nome: string; leis: StudentShortcut[] };
export type StudentShortcutsData = { minhaSelecao: StudentShortcutSelection; selecoesProntas: StudentShortcutSelection[]; leisDisponiveis: StudentShortcut[] };

export class StudentShortcutsError extends Error {
  constructor(public status: number, public publicMessage: string) { super(publicMessage); }
}

function tokenFrom(request: Request) {
  const value = request.headers.get("authorization") ?? "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() || null : null;
}

async function authenticatedClient(request: Request) {
  const token = tokenFrom(request);
  if (!token) throw new StudentShortcutsError(401, "Entre na sua conta para acessar seus atalhos.");
  const { data, error } = await getSupabaseServerClient().auth.getUser(token);
  if (error || !data.user) throw new StudentShortcutsError(401, "Sua sessão expirou. Entre novamente.");
  return createSupabaseUserClient(token);
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function parseShortcut(value: unknown, fallbackColor: ShortcutColor = "azul"): StudentShortcut | null {
  const item = record(value);
  const leiId = Number(item?.leiId);
  const cor = shortcutColors.includes(item?.cor as ShortcutColor) ? item?.cor as ShortcutColor : fallbackColor;
  if (!Number.isSafeInteger(leiId) || leiId < 1 || typeof item?.slug !== "string" || !item.slug || typeof item?.titulo !== "string" || !item.titulo || typeof item?.temAcesso !== "boolean") return null;
  return {
    leiId,
    slug: item.slug,
    titulo: item.titulo,
    recorteId: typeof item.recorteId === "string" ? item.recorteId : null,
    recorteNome: typeof item.recorteNome === "string" ? item.recorteNome : null,
    cor,
    temAcesso: item.temAcesso,
  };
}

function parseSelection(value: unknown, id: string): StudentShortcutSelection {
  const item = record(value);
  return {
    id,
    nome: typeof item?.nome === "string" && item.nome.trim() ? item.nome.trim() : "Minha seleção",
    leis: Array.isArray(item?.leis) ? item.leis.flatMap((law, index) => {
      const parsed = parseShortcut(law, shortcutColors[index % shortcutColors.length]);
      return parsed ? [parsed] : [];
    }) : [],
  };
}

export async function loadStudentShortcuts(request: Request): Promise<StudentShortcutsData> {
  const client = await authenticatedClient(request);
  const { data, error } = await client.rpc("obter_meus_atalhos");
  if (error) throw new StudentShortcutsError(503, "Não foi possível carregar seus atalhos agora.");
  const root = record(data);
  const minhaSelecao = parseSelection(root?.minhaSelecao, "pessoal");
  const selecoesProntas = Array.isArray(root?.selecoesProntas) ? root.selecoesProntas.flatMap((selection) => {
    const item = record(selection);
    if (!item || (typeof item.id !== "string" && typeof item.id !== "number")) return [];
    return [parseSelection(item, String(item.id))];
  }) : [];
  const leisDisponiveis = Array.isArray(root?.leisDisponiveis) ? root.leisDisponiveis.flatMap((law) => {
    const item = record(law);
    const parsed = item ? parseShortcut({ ...item, temAcesso: true }) : null;
    return parsed ? [parsed] : [];
  }) : [];
  return { minhaSelecao, selecoesProntas, leisDisponiveis };
}

export async function setStudentShortcutColor(request: Request, lawId: unknown, color: unknown) {
  if (!Number.isSafeInteger(lawId) || (lawId as number) < 1 || !shortcutColors.includes(color as ShortcutColor)) throw new StudentShortcutsError(400, "Atalho ou cor inválidos.");
  const client = await authenticatedClient(request);
  const { error } = await client.rpc("definir_cor_atalho_meu_edital", { p_lei_id: lawId, p_cor: color });
  if (error) throw new StudentShortcutsError(error.code === "42501" ? 403 : 400, "Não foi possível atualizar a cor do atalho.");
}

export function studentShortcutsErrorResponse(error: unknown) {
  const status = error instanceof StudentShortcutsError ? error.status : 500;
  const message = error instanceof StudentShortcutsError ? error.publicMessage : "Não foi possível concluir a operação.";
  return Response.json({ success: false, message }, { status, headers: { "Cache-Control": "private, no-store, max-age=0" } });
}
