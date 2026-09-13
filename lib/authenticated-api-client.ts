import { supabase } from "@/lib/supabase";

export async function protectedApiHeaders(extra: Record<string, string> = {}) {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error("Não foi possível verificar sua sessão agora. Tente novamente.");
  const token = data.session?.access_token;
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra;
}

export async function protectedApiFetch(path: string, init: RequestInit = {}) {
  const extra = Object.fromEntries(new Headers(init.headers).entries());
  return fetch(path, { ...init, credentials: "same-origin", headers: await protectedApiHeaders(extra) });
}

export function academicResponseMessage(status: number, message: unknown, fallback: string) {
  if (status === 401) return "Sua sessão expirou. Entre novamente.";
  const safeMessage = typeof message === "string" && message.trim() && !/sess[aã]o expir/i.test(message) ? message : null;
  if (status === 403) return safeMessage || "Este conteúdo não está liberado para sua conta.";
  if (status >= 500) return safeMessage || "Não foi possível carregar o conteúdo agora. Tente novamente.";
  return safeMessage || fallback;
}
