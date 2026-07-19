"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { adminCookieNames, emailEhAdministrador, exigirAdministrador } from "@/lib/admin-auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { LEGISBOT_COMENTARIO_STATUS, type LegisBotComentarioStatus } from "@/lib/legisbot-comentario";

export type AdminActionState = { ok: boolean; message: string };

export async function entrarAdministrador(_: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { ok: false, message: "Informe e-mail e senha." };
  if (!emailEhAdministrador(email)) return { ok: false, message: "Este usuário não possui acesso administrativo." };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return { ok: false, message: "Supabase Auth não configurado." };
  const auth = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await auth.auth.signInWithPassword({ email, password });
  if (error || !data.session) return { ok: false, message: "E-mail ou senha inválidos." };
  const store = await cookies();
  const options = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/" };
  store.set(adminCookieNames.access, data.session.access_token, { ...options, maxAge: data.session.expires_in });
  store.set(adminCookieNames.refresh, data.session.refresh_token, { ...options, maxAge: 60 * 60 * 24 * 30 });
  redirect("/admin/legisbot");
}

export async function sairAdministrador() {
  const store = await cookies();
  store.delete(adminCookieNames.access);
  store.delete(adminCookieNames.refresh);
  redirect("/admin/login");
}

export async function salvarComentario(_: AdminActionState, formData: FormData): Promise<AdminActionState> {
  await exigirAdministrador();
  const id = Number(formData.get("id"));
  const status = String(formData.get("status") ?? "") as LegisBotComentarioStatus;
  const titulo = String(formData.get("titulo") ?? "").trim();
  const assunto = String(formData.get("assunto") ?? "").trim();
  const legislacao = String(formData.get("legislacao") ?? "").trim();
  const comentario = String(formData.get("comentario") ?? "");
  const modeloIa = String(formData.get("modelo_ia") ?? "").trim();
  if (!Number.isSafeInteger(id) || id < 1) return { ok: false, message: "Registro inválido." };
  if (!LEGISBOT_COMENTARIO_STATUS.includes(status)) return { ok: false, message: "Status inválido." };
  if (!titulo || !assunto || !legislacao) return { ok: false, message: "Título, assunto e legislação são obrigatórios." };
  if (titulo.length > 255 || assunto.length > 255 || modeloIa.length > 50) return { ok: false, message: "Um dos campos excede o limite permitido." };
  const { error } = await getSupabaseServerClient().from("legisbot_comentarios").update({
    titulo, assunto, legislacao, comentario: comentario || null, status, modelo_ia: modeloIa || null,
  }).eq("id", id);
  if (error) return { ok: false, message: "Não foi possível salvar as alterações." };
  revalidatePath("/admin/legisbot");
  revalidatePath(`/admin/legisbot/${id}`);
  return { ok: true, message: "Alterações salvas com sucesso." };
}

export async function excluirComentario(formData: FormData) {
  await exigirAdministrador();
  const id = Number(formData.get("id"));
  if (!Number.isSafeInteger(id) || id < 1) return;
  const { error } = await getSupabaseServerClient().from("legisbot_comentarios").delete().eq("id", id);
  if (error) redirect(`/admin/legisbot/${id}?erro=exclusao`);
  revalidatePath("/admin/legisbot");
  redirect("/admin/legisbot?excluido=1");
}
