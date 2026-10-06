import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient, type User } from "@supabase/supabase-js";

const ACCESS_COOKIE = "legisbot_admin_access";
const REFRESH_COOKIE = "legisbot_admin_refresh";
// O token de acesso do Supabase continua curto. Este prazo é apenas do cookie
// que guarda o token de renovação e é regravado a cada renovação bem-sucedida.
export const ADMIN_REFRESH_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function adminCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
  };
}

function renovarCookieAdministrativo(store: Awaited<ReturnType<typeof cookies>>, refreshToken: string | undefined) {
  if (!refreshToken) return;
  try {
    store.set(REFRESH_COOKIE, refreshToken, { ...adminCookieOptions(), maxAge: ADMIN_REFRESH_COOKIE_MAX_AGE });
  } catch {
    // Server Components validam a sessão, mas apenas Actions e Route Handlers
    // podem renovar a expiração do cookie no navegador.
  }
}

function emailsAdministradores(): string[] {
  return (process.env.LEGISBOT_ADMIN_EMAILS ?? process.env.LEGISBOT_ADMIN_EMAIL ?? "")
    .split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
}

function clienteAuth() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("Supabase Auth não configurado.");
  return createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function emailEhAdministrador(email?: string | null): boolean {
  return Boolean(email && emailsAdministradores().includes(email.toLowerCase()));
}

export function usuarioEhAdministrador(
  user?: Pick<User, "email" | "app_metadata"> | null,
): boolean {
  return Boolean(
    user && (
      emailEhAdministrador(user.email)
      || user.app_metadata?.role === "admin"
      || user.app_metadata?.admin === true
    )
  );
}

export async function obterAdministrador() {
  const store = await cookies();
  const accessToken = store.get(ACCESS_COOKIE)?.value;
  const refreshToken = store.get(REFRESH_COOKIE)?.value;
  const auth = clienteAuth();
  if (accessToken) {
    const { data, error } = await auth.auth.getUser(accessToken);
    if (!error && usuarioEhAdministrador(data.user)) {
      renovarCookieAdministrativo(store, refreshToken);
      return data.user;
    }
  }
  if (!refreshToken) return null;
  const refreshed = await auth.auth.refreshSession({ refresh_token: refreshToken });
  if (refreshed.error || !refreshed.data.session || !usuarioEhAdministrador(refreshed.data.user)) {
    return null;
  }

  try {
    const options = adminCookieOptions();
    store.set(ACCESS_COOKIE, refreshed.data.session.access_token, { ...options, maxAge: refreshed.data.session.expires_in });
    renovarCookieAdministrativo(store, refreshed.data.session.refresh_token);
  } catch {
    // Server Components podem validar a sessão, mas apenas Actions e Route Handlers renovam cookies.
  }

  return refreshed.data.user;
}

export async function exigirAdministrador() {
  const user = await obterAdministrador();
  if (!user) redirect("/admin/login");
  return user;
}

export const adminCookieNames = { access: ACCESS_COOKIE, refresh: REFRESH_COOKIE };
