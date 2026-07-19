import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient, type User } from "@supabase/supabase-js";

const ACCESS_COOKIE = "legisbot_admin_access";
const REFRESH_COOKIE = "legisbot_admin_refresh";

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
  if (!accessToken) return null;
  const auth = clienteAuth();
  const { data, error } = await auth.auth.getUser(accessToken);
  if (!error && usuarioEhAdministrador(data.user)) return data.user;
  const refreshToken = store.get(REFRESH_COOKIE)?.value;
  if (!refreshToken) return null;
  const refreshed = await auth.auth.refreshSession({ refresh_token: refreshToken });
  if (refreshed.error || !refreshed.data.session || !usuarioEhAdministrador(refreshed.data.user)) {
    return null;
  }

  try {
    const options = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/" };
    store.set(ACCESS_COOKIE, refreshed.data.session.access_token, { ...options, maxAge: refreshed.data.session.expires_in });
    store.set(REFRESH_COOKIE, refreshed.data.session.refresh_token, { ...options, maxAge: 60 * 60 * 24 * 30 });
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
