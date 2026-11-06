import "server-only";
import { randomBytes } from "node:crypto";

import { getSupabaseServerClient } from "@/lib/supabase-server";

export class StudentProvisionalPasswordError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "StudentProvisionalPasswordError";
  }
}

function provisionalPassword() {
  // 144 bits aleatórios mais classes de caracteres compatíveis com políticas de senha.
  return `${randomBytes(18).toString("base64url")}Aa1!`;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function hasEmailPasswordIdentity(user: { identities?: Array<{ provider?: string }> | null; app_metadata?: Record<string, unknown> | null }) {
  return user.identities?.some((identity) => identity.provider === "email")
    || user.app_metadata?.provider === "email";
}

async function findAuthUserByEmail(email: string) {
  const supabase = getSupabaseServerClient();
  for (let page = 1; page <= 100; page += 1) {
    const listed = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (listed.error) throw new StudentProvisionalPasswordError(500, "Não foi possível localizar a conta de acesso.");
    const user = listed.data.users.find((item) => item.email?.trim().toLowerCase() === email);
    if (user) return user;
    if (listed.data.users.length < 1000) return null;
  }
  throw new StudentProvisionalPasswordError(500, "Não foi possível localizar a conta de acesso.");
}

async function requirePasswordIdentity(userId: string) {
  const result = await getSupabaseServerClient().auth.admin.getUserById(userId);
  if (result.error || !result.data.user) {
    throw new StudentProvisionalPasswordError(409, "A conta de acesso vinculada ao aluno não foi encontrada.");
  }
  if (!hasEmailPasswordIdentity(result.data.user)) {
    throw new StudentProvisionalPasswordError(422, "Esta conta usa exclusivamente um provedor externo. Oriente o aluno a recuperar o acesso pelo provedor ou vincule primeiro um método de senha.");
  }
  return result.data.user;
}

/**
 * Troca apenas a credencial Auth do aluno e preserva todos os seus dados de negócio.
 * O chamador deve ter validado a autorização administrativa e fornecer o UUID do ator.
 */
export async function generateStudentProvisionalPassword(alunoId: string, actorUserId: string) {
  if (!isUuid(alunoId) || !isUuid(actorUserId)) {
    throw new StudentProvisionalPasswordError(400, "Aluno ou administrador inválido.");
  }

  const supabase = getSupabaseServerClient();
  const current = await supabase.from("alunos").select("id,user_id,nome,email").eq("id", alunoId).single();
  if (current.error || !current.data) throw new StudentProvisionalPasswordError(404, "Aluno não encontrado.");

  const email = String(current.data.email).trim().toLowerCase();
  const duplicates = await supabase.from("alunos").select("id,email").ilike("email", `%${email}%`);
  if (duplicates.error) throw new StudentProvisionalPasswordError(500, "Não foi possível validar a identidade do aluno.");
  const sameIdentity = (duplicates.data ?? []).filter((item) => String(item.email).trim().toLowerCase() === email);
  if (sameIdentity.length !== 1) throw new StudentProvisionalPasswordError(409, "Acesso bloqueado: existe duplicidade histórica para este e-mail.");

  // Marque antes de alterar o Auth: se o provedor falhar, a conta continua
  // bloqueada das áreas do aluno, sem uma janela de senha provisória não forçada.
  const flagged = await supabase.from("alunos").update({ deve_trocar_senha: true }).eq("id", alunoId);
  if (flagged.error) throw new StudentProvisionalPasswordError(500, "Não foi possível marcar a troca obrigatória de senha.");

  const password = provisionalPassword();
  let userId = current.data.user_id as string | null;
  if (userId) {
    await requirePasswordIdentity(userId);
    const updated = await supabase.auth.admin.updateUserById(userId, { password });
    if (updated.error) throw new StudentProvisionalPasswordError(500, "Não foi possível atualizar a senha da conta Auth.");
  } else {
    let authUser = await findAuthUserByEmail(email);
    if (!authUser) {
      const created = await supabase.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { nome: current.data.nome ?? undefined } });
      if (created.error || !created.data.user) throw new StudentProvisionalPasswordError(500, "Não foi possível criar a conta Auth.");
      authUser = created.data.user;
    } else {
      if (!hasEmailPasswordIdentity(authUser)) {
        throw new StudentProvisionalPasswordError(422, "A conta encontrada usa exclusivamente um provedor externo. Não foi criada uma senha para evitar alterar o método de acesso sem tratamento específico.");
      }
      const updated = await supabase.auth.admin.updateUserById(authUser.id, { password });
      if (updated.error) throw new StudentProvisionalPasswordError(500, "Não foi possível atualizar a senha da conta Auth existente.");
    }
    const conflict = await supabase.from("alunos").select("id").eq("user_id", authUser.id).neq("id", alunoId).maybeSingle();
    if (conflict.error) throw new StudentProvisionalPasswordError(500, "Não foi possível validar o vínculo Auth.");
    if (conflict.data) throw new StudentProvisionalPasswordError(409, "Acesso bloqueado: a conta Auth já pertence a outro aluno.");
    const linked = await supabase.from("alunos").update({ user_id: authUser.id }).eq("id", alunoId);
    if (linked.error) throw new StudentProvisionalPasswordError(500, "Não foi possível vincular a conta Auth ao aluno.");
    userId = authUser.id;
  }

  const audit = await supabase.from("auditoria_administrativa").insert({
    ator_user_id: actorUserId,
    acao: "gerar_senha_provisoria",
    entidade: "aluno",
    entidade_id: alunoId,
    detalhes: { user_id: userId },
  });
  if (audit.error) throw new StudentProvisionalPasswordError(500, "Não foi possível auditar a senha provisória.");

  return { senha_provisoria: password, user_id: userId };
}
