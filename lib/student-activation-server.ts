import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createOperationalAdminNotification } from "@/lib/admin-notification-server";

const ACTIVATION_TTL_MS = 1000 * 60 * 60 * 24 * 3;
const PLATFORM_URL = "https://www.legisflashcards.com.br";

function normalizeEmail(value: string) { return value.trim().toLowerCase(); }
function tokenHash(token: string) { return createHash("sha256").update(token).digest("hex"); }
function newToken() { return randomBytes(32).toString("base64url"); }
function invalidLink() { return { state: "invalid" as const }; }

type ActivationStudent = { id: string; email: string; nome: string | null; user_id: string | null };

async function getActivation(supabase: SupabaseClient, token: string) {
  if (!token || token.length < 32) return null;
  const activation = await supabase
    .from("alunos_ativacoes_pendentes")
    .select("id,aluno_id,expires_at,reserved_at,used_at,invalidated_at")
    .eq("token_hash", tokenHash(token))
    .maybeSingle();
  if (activation.error || !activation.data) return null;
  const data = activation.data;
  const student = await supabase.from("alunos").select("id,email,nome,user_id").eq("id", data.aluno_id).maybeSingle();
  if (student.error || !student.data) return null;
  return { activation: data, student: student.data as ActivationStudent };
}

async function audit(supabase: SupabaseClient, action: string, studentId: string, details: Record<string, unknown>) {
  await supabase.from("auditoria_administrativa").insert({ acao: action, entidade: "aluno", entidade_id: studentId, detalhes: details });
}

async function findAuthUserByEmail(supabase: SupabaseClient, email: string): Promise<User | null> {
  for (let page = 1; page <= 100; page += 1) {
    const users = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (users.error) throw new Error("Nao foi possivel localizar a conta Auth.");
    const found = users.data.users.find((user) => normalizeEmail(user.email ?? "") === email);
    if (found) return found;
    if (users.data.users.length < 1000) return null;
  }
  throw new Error("Nao foi possivel localizar a conta Auth.");
}

export async function createStudentActivationLink(supabase: SupabaseClient, studentId: string) {
  const token = newToken();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + ACTIVATION_TTL_MS).toISOString();
  const previous = await supabase.from("alunos_ativacoes_pendentes")
    .update({ invalidated_at: now })
    .eq("aluno_id", studentId)
    .is("used_at", null)
    .is("invalidated_at", null);
  if (previous.error) throw new Error("Nao foi possivel preparar a ativacao da conta.");
  const inserted = await supabase.from("alunos_ativacoes_pendentes").insert({ aluno_id: studentId, token_hash: tokenHash(token), expires_at: expiresAt });
  if (inserted.error) throw new Error("Nao foi possivel criar o link de ativacao.");
  return `${PLATFORM_URL}/conta/ativar?token=${encodeURIComponent(token)}`;
}

export async function inspectStudentActivation(supabase: SupabaseClient, token: string) {
  const result = await getActivation(supabase, token);
  if (!result || !result.student) return invalidLink();
  if (result.student.user_id) return { state: "activated" as const };
  if (result.activation.invalidated_at || result.activation.used_at || result.activation.reserved_at || new Date(result.activation.expires_at).getTime() <= Date.now()) return invalidLink();
  return { state: "valid" as const, email: normalizeEmail(result.student.email) };
}

export async function activateStudentAccount(supabase: SupabaseClient, token: string, password: string) {
  const result = await getActivation(supabase, token);
  if (!result || !result.student) return invalidLink();
  const { activation, student } = result;
  if (student.user_id) return { state: "activated" as const };
  if (activation.invalidated_at || activation.used_at || activation.reserved_at || new Date(activation.expires_at).getTime() <= Date.now()) return invalidLink();
  const email = normalizeEmail(student.email);
  const identities = await supabase.from("alunos").select("id,email").ilike("email", `%${email}%`);
  if (identities.error) throw new Error("Nao foi possivel validar a identidade do aluno.");
  if ((identities.data ?? []).filter((item) => normalizeEmail(String(item.email)) === email).length !== 1) {
    await audit(supabase, "ativacao_conta_bloqueada", student.id, { motivo: "duplicidade_email" });
    throw new Error("A ativacao desta conta precisa de analise da equipe.");
  }

  const reservedAt = new Date().toISOString();
  const reservation = await supabase.from("alunos_ativacoes_pendentes")
    .update({ reserved_at: reservedAt })
    .eq("id", activation.id)
    .is("used_at", null)
    .is("invalidated_at", null)
    .is("reserved_at", null)
    .select("id");
  if (reservation.error) throw new Error("Nao foi possivel reservar a ativacao da conta.");
  if (!reservation.data?.length) return invalidLink();

  try {
    let authUser = await findAuthUserByEmail(supabase, email);
    if (authUser) {
      const conflict = await supabase.from("alunos").select("id").eq("user_id", authUser.id).neq("id", student.id).maybeSingle();
      if (conflict.error) throw new Error("Nao foi possivel validar o vinculo Auth.");
      if (conflict.data) {
        await audit(supabase, "ativacao_conta_bloqueada", student.id, { motivo: "auth_em_outro_aluno" });
        throw new Error("A ativacao desta conta precisa de analise da equipe.");
      }
      const updated = await supabase.auth.admin.updateUserById(authUser.id, { password });
      if (updated.error) throw new Error("Nao foi possivel definir a senha da conta.");
    } else {
      const created = await supabase.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { nome: student.nome ?? undefined } });
      if (created.error || !created.data.user) throw new Error("Nao foi possivel criar a conta.");
      authUser = created.data.user;
    }

    const linked = await supabase.rpc("vincular_aluno_para_usuario", { p_user_id: authUser.id, p_email: email, p_nome: student.nome });
    if (linked.error || linked.data === "conflict") throw new Error("Nao foi possivel vincular a conta ao aluno.");
    const used = await supabase.from("alunos_ativacoes_pendentes").update({ used_at: new Date().toISOString() }).eq("id", activation.id).eq("reserved_at", reservedAt).is("used_at", null).is("invalidated_at", null);
    if (used.error) throw new Error("Nao foi possivel concluir a ativacao da conta.");
    await audit(supabase, "conta_ativada", student.id, { origem: "link_ativacao" });
    await createOperationalAdminNotification(supabase, {
      tipo: "conta_ativada", titulo: "Conta ativada",
      mensagem: `${student.nome || email} ativou a conta de acesso.`,
      link: `/admin/comercial?tab=alunos&q=${encodeURIComponent(email)}`,
      entidadeTipo: "ativacao_conta", entidadeId: activation.id,
    });
    return { state: "activated_now" as const };
  } catch (error) {
    await supabase.from("alunos_ativacoes_pendentes").update({ reserved_at: null }).eq("id", activation.id).eq("reserved_at", reservedAt).is("used_at", null);
    throw error;
  }
}
