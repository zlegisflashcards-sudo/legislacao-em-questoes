import { randomBytes } from "node:crypto";
import type { SupabaseClient, User } from "@supabase/supabase-js";

export type FirstAccessOrigin = "hotmart" | "administrativo" | "cortesia" | "amostra" | "premiacao" | "migracao";
type AccessInput = { studentId: string; origin: FirstAccessOrigin; idempotencyKey: string; accessLabel: string; kind?: "acquisition" | "release" };

function normalizedEmail(value: string) { return value.trim().toLowerCase(); }
function provisionalPassword() { return `${randomBytes(18).toString("base64url")}Aa1!`; }
function diagnostic(stage: string, details: Record<string, unknown>) { console.info("[student-access-notification]", { stage, ...details }); }

async function findAuthUserByEmail(supabase: SupabaseClient, email: string): Promise<User | null> {
  for (let page = 1; page <= 100; page += 1) {
    const listed = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (listed.error) throw new Error("Não foi possível localizar a conta Auth pelo e-mail.");
    const user = listed.data.users.find((item) => normalizedEmail(item.email ?? "") === email);
    if (user) return user;
    if (listed.data.users.length < 1000) return null;
  }
  throw new Error("Não foi possível localizar a conta Auth pelo e-mail.");
}

async function audit(supabase: SupabaseClient, action: string, studentId: string, details: Record<string, unknown>) {
  const result = await supabase.from("auditoria_administrativa").insert({ acao: action, entidade: "aluno", entidade_id: studentId, detalhes: details });
  if (result.error) throw new Error("Não foi possível registrar a auditoria de acesso.");
}

async function sendEmail(to: string, subject: string, text: string, idempotencyKey: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) throw new Error("Configuração do e-mail de acesso indisponível.");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({ from, to: [to], subject, text }),
  });
  if (!response.ok) throw new Error(`Falha do serviço de e-mail (HTTP ${response.status}).`);
}

function firstAccessText(name: string | null, email: string, password: string) {
  return `Olá, ${name?.trim() || "aluno(a)"}.\n\nSeu acesso à plataforma Legislação em Questões foi liberado.\n\nAcesse: https://www.legisflashcards.com.br/conta\nE-mail de acesso: ${email}\nSenha provisória: ${password}\n\nNo primeiro acesso, você deverá criar uma nova senha.`;
}
function accessNotificationText(name: string | null, email: string, label: string) {
  return `Olá, ${name?.trim() || "aluno(a)"}.\n\nUm novo acesso foi liberado para sua conta: ${label}.\n\nAcesse sua área de estudos: https://www.legisflashcards.com.br/conta\n\nUse o mesmo e-mail e senha que você já utiliza normalmente.`;
}

async function reserveFirstAccess(supabase: SupabaseClient, input: AccessInput, status: string | null) {
  if (status === "reservado") return false;
  if (status === "falhou") {
    const retry = await supabase.from("alunos_primeiro_acesso_envios").update({ status: "reservado", origem: input.origin, idempotency_key: input.idempotencyKey, erro: null, enviado_em: null, auth_user_id: null }).eq("aluno_id", input.studentId).eq("status", "falhou");
    if (retry.error) throw new Error("Não foi possível reservar novamente o primeiro acesso.");
    return true;
  }
  const created = await supabase.from("alunos_primeiro_acesso_envios").insert({ aluno_id: input.studentId, origem: input.origin, idempotency_key: input.idempotencyKey, status: "reservado" });
  if (created.error?.code === "23505") return false;
  if (created.error) throw new Error("Não foi possível reservar o envio de primeiro acesso.");
  return true;
}

async function sendNewAccessNotification(supabase: SupabaseClient, student: { id: string; nome: string | null; email: string }, input: AccessInput) {
  const type = input.kind === "release" ? "nova_liberacao" : "nova_aquisicao";
  const reserve = await supabase.from("alunos_notificacoes_acesso").insert({ aluno_id: student.id, idempotency_key: input.idempotencyKey, tipo: type, origem: input.origin, descricao: input.accessLabel, status: "reservado" });
  if (reserve.error?.code === "23505") return { created: false, reason: "notification_already_reserved" as const };
  if (reserve.error) throw new Error("Não foi possível reservar a notificação de novo acesso.");
  try {
    diagnostic("access_notification_requested", { studentId: student.id, origin: input.origin, idempotencyKey: input.idempotencyKey });
    await sendEmail(student.email, "Novo acesso liberado na Legislação em Questões", accessNotificationText(student.nome, student.email, input.accessLabel), input.idempotencyKey);
    const sent = await supabase.from("alunos_notificacoes_acesso").update({ status: "enviado", enviado_em: new Date().toISOString(), erro: null }).eq("idempotency_key", input.idempotencyKey);
    if (sent.error) throw new Error("Não foi possível registrar a notificação enviada.");
    await audit(supabase, "notificacao_novo_acesso_enviada", student.id, { origem: input.origin, tipo: type, descricao: input.accessLabel });
    return { created: true, reason: "access_notification_sent" as const };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Falha desconhecida";
    await supabase.from("alunos_notificacoes_acesso").update({ status: "falhou", erro: message }).eq("idempotency_key", input.idempotencyKey);
    await audit(supabase, "notificacao_novo_acesso_falhou", student.id, { origem: input.origin, tipo: type, motivo: message });
    throw error;
  }
}

export async function provisionStudentFirstAccess(supabase: SupabaseClient, input: AccessInput) {
  const studentResult = await supabase.from("alunos").select("id,user_id,nome,email,deve_trocar_senha").eq("id", input.studentId).single();
  if (studentResult.error || !studentResult.data) throw new Error("Aluno não encontrado para o primeiro acesso.");
  const student = studentResult.data;
  const email = normalizedEmail(String(student.email));
  const candidates = await supabase.from("alunos").select("id,email").ilike("email", `%${email}%`);
  if (candidates.error) throw new Error("Não foi possível validar a identidade do aluno.");
  if ((candidates.data ?? []).filter((item) => normalizedEmail(String(item.email)) === email).length !== 1) {
    await audit(supabase, "primeiro_acesso_bloqueado", student.id, { origem: input.origin, motivo: "duplicidade_email" });
    throw new Error("Primeiro acesso bloqueado: existe duplicidade histórica para este e-mail.");
  }

  const first = await supabase.from("alunos_primeiro_acesso_envios").select("status").eq("aluno_id", student.id).maybeSingle();
  if (first.error) throw new Error("Não foi possível consultar o estado do primeiro acesso.");
  if (first.data?.status === "enviado") return sendNewAccessNotification(supabase, student, input);
  if (!await reserveFirstAccess(supabase, input, first.data?.status ?? null)) return { created: false, reason: "first_access_in_progress" as const };

  const password = provisionalPassword();
  let userId = student.user_id as string | null;
  try {
    if (userId) {
      const updated = await supabase.auth.admin.updateUserById(userId, { password });
      if (updated.error) throw new Error("Não foi possível atualizar a senha provisória da conta Auth.");
    } else {
      const auth = await findAuthUserByEmail(supabase, email);
      if (auth) {
        const conflict = await supabase.from("alunos").select("id").eq("user_id", auth.id).neq("id", student.id).maybeSingle();
        if (conflict.error || conflict.data) throw new Error("Primeiro acesso bloqueado: a conta Auth já pertence a outro aluno.");
        const updated = await supabase.auth.admin.updateUserById(auth.id, { password });
        if (updated.error) throw new Error("Não foi possível atualizar a senha provisória da conta Auth.");
        userId = auth.id;
      } else {
        const created = await supabase.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { nome: student.nome ?? undefined } });
        if (created.error || !created.data.user) throw new Error("Não foi possível criar a conta Auth.");
        userId = created.data.user.id;
      }
    }
    const linked = await supabase.from("alunos").update({ user_id: userId, deve_trocar_senha: true }).eq("id", student.id);
    if (linked.error) throw new Error("Não foi possível vincular a conta Auth ao aluno.");
    await audit(supabase, "primeiro_acesso_criado", student.id, { origem: input.origin, user_id: userId });
    diagnostic("first_access_email_requested", { studentId: student.id, origin: input.origin, idempotencyKey: input.idempotencyKey });
    await sendEmail(email, "Seu acesso à plataforma Legislação em Questões", firstAccessText(student.nome, email, password), input.idempotencyKey);
    const sent = await supabase.from("alunos_primeiro_acesso_envios").update({ status: "enviado", auth_user_id: userId, enviado_em: new Date().toISOString(), erro: null }).eq("aluno_id", student.id);
    if (sent.error) throw new Error("Não foi possível registrar o envio de primeiro acesso.");
    await audit(supabase, "email_primeiro_acesso_enviado", student.id, { origem: input.origin });
    return { created: true, reason: "first_access_sent" as const };
  } catch (error) {
    const message = error instanceof Error ? error.message.replace(/senha[^.]*/gi, "credencial ocultada").slice(0, 500) : "Falha desconhecida";
    await supabase.from("alunos_primeiro_acesso_envios").update({ status: "falhou", erro: message }).eq("aluno_id", student.id);
    await audit(supabase, "email_primeiro_acesso_falhou", student.id, { origem: input.origin, motivo: message });
    throw error;
  }
}
