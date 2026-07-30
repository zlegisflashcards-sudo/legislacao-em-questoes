"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { adminCookieNames, exigirAdministrador, usuarioEhAdministrador } from "@/lib/admin-auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { sanitizarComentarioHtml } from "@/lib/legisbot/sanitize-comment-html";
import { possuiTextoLegislacao, sanitizarHtmlLegislacao } from "@/lib/legisbot/sanitize-legal-html";
import {
  LEGISBOT_COMENTARIO_STATUS,
  type LegisBotComentario,
  type LegisBotComentarioStatus,
} from "@/lib/legisbot-comentario";

export type AdminActionState = {
  ok: boolean;
  message: string;
  record?: LegisBotComentario;
  existing?: { id: number; publicUrl: string };
  fieldErrors?: Partial<Record<"slug" | "ordem" | "titulo" | "assunto" | "legislacao" | "comentario" | "status", string>>;
};

const SLUG_VALIDO = /^[A-Z0-9_-]{1,50}$/;
const ORDEM_VALIDA = /^[A-Za-z0-9._-]{1,20}$/;

export async function entrarAdministrador(_: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { ok: false, message: "Informe e-mail e senha." };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return { ok: false, message: "Supabase Auth não configurado." };
  const auth = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await auth.auth.signInWithPassword({ email, password });
  if (error || !data.session) return { ok: false, message: "E-mail ou senha inválidos." };
  if (!usuarioEhAdministrador(data.user)) {
    await auth.auth.signOut({ scope: "local" });
    return { ok: false, message: "Este usuário não possui acesso administrativo." };
  }
  const store = await cookies();
  const options = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/" };
  store.set(adminCookieNames.access, data.session.access_token, { ...options, maxAge: data.session.expires_in });
  store.set(adminCookieNames.refresh, data.session.refresh_token, { ...options, maxAge: 60 * 60 * 24 * 30 });
  redirect("/admin");
}

export async function sairAdministrador() {
  const store = await cookies();
  const accessToken = store.get(adminCookieNames.access)?.value;
  const refreshToken = store.get(adminCookieNames.refresh)?.value;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (accessToken && refreshToken && url && key) {
    try {
      const auth = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
      const session = await auth.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      if (!session.error) await auth.auth.signOut({ scope: "local" });
    } catch {
      // Os cookies locais ainda devem ser removidos se o Supabase estiver indisponível.
    }
  }
  store.delete(adminCookieNames.access);
  store.delete(adminCookieNames.refresh);
  redirect("/admin/login");
}

export async function salvarComentario(_: AdminActionState, formData: FormData): Promise<AdminActionState> {
  await exigirAdministrador();
  const rawId = String(formData.get("id") ?? "");
  const id = rawId ? Number(rawId) : null;
  const slug = String(formData.get("slug") ?? "").trim().toUpperCase();
  const ordem = String(formData.get("ordem") ?? "").trim();
  const titulo = String(formData.get("titulo") ?? "").trim();
  const assunto = String(formData.get("assunto") ?? "").trim();
  const legislacao = sanitizarHtmlLegislacao(String(formData.get("legislacao") ?? ""));
  const comentarioOriginal = String(formData.get("comentario") ?? "");
  const comentario = sanitizarComentarioHtml(comentarioOriginal);
  const modeloIa = String(formData.get("modelo_ia") ?? "").trim();
  const intent = String(formData.get("intent") ?? "save");
  const selectedStatus = String(formData.get("status") ?? "") as LegisBotComentarioStatus;
  const status = (intent === "draft" ? "pendente" : intent === "publish" ? "concluido" : selectedStatus) as LegisBotComentarioStatus;
  const fieldErrors: NonNullable<AdminActionState["fieldErrors"]> = {};

  if (id !== null && (!Number.isSafeInteger(id) || id < 1)) return { ok: false, message: "Registro inválido." };
  if (!SLUG_VALIDO.test(slug)) fieldErrors.slug = "Use de 1 a 50 letras, números, _ ou -.";
  if (!ORDEM_VALIDA.test(ordem)) fieldErrors.ordem = "Use de 1 a 20 letras, números, ponto, _ ou -.";
  if (!titulo) fieldErrors.titulo = "Informe o título.";
  if (!assunto) fieldErrors.assunto = "Informe o assunto.";
  if (!possuiTextoLegislacao(legislacao)) fieldErrors.legislacao = "Informe o texto literal da legislação.";
  if (!comentario) fieldErrors.comentario = "Informe o HTML do comentário.";
  if (!LEGISBOT_COMENTARIO_STATUS.includes(status)) fieldErrors.status = "Status inválido.";
  if (titulo.length > 255) fieldErrors.titulo = "Use no máximo 255 caracteres.";
  if (assunto.length > 255) fieldErrors.assunto = "Use no máximo 255 caracteres.";
  if (modeloIa.length > 50) return { ok: false, message: "O modelo de IA excede o limite de 50 caracteres." };
  if (Object.keys(fieldErrors).length) return { ok: false, message: "Revise os campos destacados.", fieldErrors };

  const supabase = getSupabaseServerClient();
  if (id !== null) {
    const currentResult = await supabase.from("legisbot_comentarios").select("*").eq("id", id).maybeSingle();
    if (currentResult.error || !currentResult.data) return { ok: false, message: "Comentário não encontrado." };
    const current = currentResult.data as LegisBotComentario;
    const identifiersChanged = current.slug !== slug || current.ordem !== ordem;
    if (identifiersChanged && formData.get("identifiers_confirmed") !== "yes") {
      return { ok: false, message: "Confirme a alteração dos campos identificadores antes de salvar." };
    }
  }

  const duplicate = await supabase
    .from("legisbot_comentarios")
    .select("id")
    .eq("slug", slug)
    .eq("ordem", ordem)
    .maybeSingle();
  if (duplicate.error) return { ok: false, message: "Não foi possível verificar a duplicidade." };
  if (duplicate.data && Number(duplicate.data.id) !== id) {
    return {
      ok: false,
      message: "Já existe um comentário com esta combinação de slug e ordem.",
      existing: {
        id: Number(duplicate.data.id),
        publicUrl: `/legisbot/${encodeURIComponent(slug.toLowerCase())}/${encodeURIComponent(ordem)}`,
      },
      fieldErrors: { slug: "Combinação já utilizada.", ordem: "Combinação já utilizada." },
    };
  }

  const payload = { slug, ordem, titulo, assunto, legislacao, comentario, status, modelo_ia: modeloIa || null };
  const result = id === null
    ? await supabase.from("legisbot_comentarios").insert(payload).select("*").single()
    : await supabase.from("legisbot_comentarios").update(payload).eq("id", id).select("*").single();
  if (result.error) {
    if (result.error.code === "23505") return { ok: false, message: "Já existe um comentário com esta combinação de slug e ordem." };
    return { ok: false, message: "Não foi possível salvar as alterações." };
  }

  const saved = result.data as LegisBotComentario;
  revalidatePath("/admin/legisbot");
  revalidatePath(`/admin/legisbot/${saved.id}`);
  revalidatePath(`/legisbot/${saved.slug.toLowerCase()}/${saved.ordem}`);
  return {
    ok: true,
    message: `${id === null ? "Comentário criado" : "Alterações salvas"} com sucesso.${comentario !== comentarioOriginal.trim() ? " O HTML foi sanitizado antes da gravação." : ""}`,
    record: saved,
  };
}

export async function alterarStatusComentario(formData: FormData) {
  await exigirAdministrador();
  const id = Number(formData.get("id"));
  const status = String(formData.get("status") ?? "");
  if (!Number.isSafeInteger(id) || id < 1 || !["pendente", "concluido"].includes(status)) return;
  const supabase = getSupabaseServerClient();
  let comentarioSanitizado: string | undefined;
  if (status === "concluido") {
    const existing = await supabase.from("legisbot_comentarios").select("comentario").eq("id", id).maybeSingle();
    if (!existing.data?.comentario?.trim()) redirect("/admin/legisbot?erro_status=1");
    comentarioSanitizado = sanitizarComentarioHtml(existing.data.comentario);
    if (!comentarioSanitizado) redirect("/admin/legisbot?erro_status=1");
  }
  await supabase
    .from("legisbot_comentarios")
    .update({ status, ...(comentarioSanitizado !== undefined ? { comentario: comentarioSanitizado } : {}) })
    .eq("id", id);
  revalidatePath("/admin/legisbot");
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
