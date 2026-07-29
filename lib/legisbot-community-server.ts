import "server-only";

import type { User } from "@supabase/supabase-js";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export class CommunityApiError extends Error {
  constructor(public status: number, public publicMessage: string) {
    super(publicMessage);
  }
}

export async function getRequestUser(request: Request): Promise<User | null> {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  if (!token) return null;
  const { data, error } = await getSupabaseServerClient().auth.getUser(token);
  return error ? null : data.user;
}

export async function requireRequestUser(request: Request): Promise<User> {
  const user = await getRequestUser(request);
  if (!user) throw new CommunityApiError(401, "Entre na sua conta para participar da discussão.");
  return user;
}

export function communityJsonError(error: unknown) {
  if (error instanceof CommunityApiError) {
    return Response.json({ success: false, message: error.publicMessage }, { status: error.status });
  }
  console.error("Falha na comunidade do LegisBot", error instanceof Error ? error.message : "erro desconhecido");
  return Response.json(
    { success: false, message: "Não foi possível concluir a operação no momento." },
    { status: 500 },
  );
}

export async function requirePublicProfile(userId: string) {
  const { data, error } = await getSupabaseServerClient()
    .from("perfis_publicos")
    .select("id,nome_publico")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new CommunityApiError(409, "Conclua seu perfil público antes de participar.");
  return data as { id: string; nome_publico: string };
}
