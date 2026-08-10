import { randomBytes } from "node:crypto";
import type { SupabaseClient, User } from "@supabase/supabase-js";

export type FirstAccessOrigin = "hotmart" | "administrativo" | "cortesia" | "amostra" | "premiacao" | "migracao";

function normalizedEmail(value: string) {
  return value.trim().toLowerCase();
}

function provisionalPassword() {
  return `${randomBytes(18).toString("base64url")}Aa1!`;
}

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
  if (result.error) throw new Error("Não foi possível registrar a auditoria do primeiro acesso.");
}

function diagnostic(stage: string, details: Record<string, unknown>) {
  console.info("[student-first-access]", { stage, ...details });
}

async function sendFirstAccessEmail({ name, email, password, idempotencyKey }: { name: string | null; email: string; password: string; idempotencyKey: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) throw new Error("Configuração do e-mail de primeiro acesso indisponível.");
  const greeting = name?.trim() || "aluno(a)";
  const text = [
    `Olá, ${greeting}.`, "", "Seu acesso à plataforma Legislação em Questões já está disponível.", "",
    "Acesse: https://www.legisflashcards.com.br/conta", `E-mail de acesso: ${email}`, `Senha provisória: ${password}`, "",
    "No primeiro acesso, você será solicitado a criar uma nova senha de sua preferência.",
    "Após alterar a senha, utilize sempre a nova senha para entrar.", "",
    "Se tiver qualquer dificuldade para acessar, entre em contato conosco.", "", "Legislação em Questões",
  ].join("\n");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({ from, to: [email], subject: "Seu acesso à plataforma Legislação em Questões", text }),
  });
  if (!response.ok) throw new Error(`Falha do serviço de e-mail (HTTP ${response.status}).`);
}

export async function provisionStudentFirstAccess(
  supabase: SupabaseClient,
  input: { studentId: string; origin: FirstAccessOrigin; idempotencyKey: string },
) {
  const studentResult = await supabase.from("alunos").select("id,user_id,nome,email").eq("id", input.studentId).single();
  if (studentResult.error || !studentResult.data) throw new Error("Aluno não encontrado para o primeiro acesso.");
  const student = studentResult.data;
  diagnostic("student_loaded", { studentId: student.id, origin: input.origin, hasUserId: Boolean(student.user_id) });
  if (student.user_id) {
    diagnostic("already_linked", { studentId: student.id, origin: input.origin });
    return { created: false, reason: "already_linked" as const };
  }
  const email = normalizedEmail(String(student.email));
  const candidates = await supabase.from("alunos").select("id,email").ilike("email", `%${email}%`);
  if (candidates.error) throw new Error("Não foi possível validar a identidade do aluno.");
  if ((candidates.data ?? []).filter((item) => normalizedEmail(String(item.email)) === email).length !== 1) {
    await audit(supabase, "primeiro_acesso_bloqueado", student.id, { origem: input.origin, motivo: "duplicidade_email" });
    throw new Error("Primeiro acesso bloqueado: existe duplicidade histórica para este e-mail.");
  }
  diagnostic("student_identity_validated", { studentId: student.id, origin: input.origin });

  const existingAuth = await findAuthUserByEmail(supabase, email);
  if (existingAuth) {
    diagnostic("auth_found", { studentId: student.id, origin: input.origin, authUserId: existingAuth.id });
    const conflict = await supabase.from("alunos").select("id").eq("user_id", existingAuth.id).neq("id", student.id).maybeSingle();
    if (conflict.error) throw new Error("Não foi possível validar o vínculo Auth.");
    if (conflict.data) {
      await audit(supabase, "primeiro_acesso_bloqueado", student.id, { origem: input.origin, motivo: "auth_em_outro_aluno" });
      throw new Error("Primeiro acesso bloqueado: a conta Auth já pertence a outro aluno.");
    }
    const linked = await supabase.from("alunos").update({ user_id: existingAuth.id }).eq("id", student.id);
    if (linked.error) throw new Error("Não foi possível vincular a conta Auth existente.");
    diagnostic("auth_linked", { studentId: student.id, origin: input.origin, authUserId: existingAuth.id });
    await audit(supabase, "primeiro_acesso_auth_existente_vinculado", student.id, { origem: input.origin, user_id: existingAuth.id });
    return { created: false, reason: "existing_auth_linked" as const };
  }

  const reservation = await supabase.from("alunos_primeiro_acesso_envios").insert({ aluno_id: student.id, origem: input.origin, idempotency_key: input.idempotencyKey, status: "reservado" });
  if (reservation.error?.code === "23505") {
    diagnostic("already_reserved", { studentId: student.id, origin: input.origin });
    return { created: false, reason: "already_reserved" as const };
  }
  if (reservation.error) throw new Error("Não foi possível reservar o envio de primeiro acesso.");
  diagnostic("first_access_reserved", { studentId: student.id, origin: input.origin });

  const password = provisionalPassword();
  try {
    const created = await supabase.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { nome: student.nome ?? undefined } });
    if (created.error || !created.data.user) throw new Error("Não foi possível criar a conta Auth.");
    diagnostic("auth_created", { studentId: student.id, origin: input.origin, authUserId: created.data.user.id });
    const linked = await supabase.from("alunos").update({ user_id: created.data.user.id, deve_trocar_senha: true }).eq("id", student.id);
    if (linked.error) throw new Error("Não foi possível vincular a conta Auth ao aluno.");
    diagnostic("auth_linked", { studentId: student.id, origin: input.origin, authUserId: created.data.user.id });
    await audit(supabase, "primeiro_acesso_criado", student.id, { origem: input.origin, user_id: created.data.user.id });
    diagnostic("resend_requested", { studentId: student.id, origin: input.origin });
    await sendFirstAccessEmail({ name: student.nome, email, password, idempotencyKey: input.idempotencyKey });
    const sent = await supabase.from("alunos_primeiro_acesso_envios").update({ status: "enviado", auth_user_id: created.data.user.id, enviado_em: new Date().toISOString(), erro: null }).eq("aluno_id", student.id);
    if (sent.error) throw new Error("Não foi possível registrar o envio de primeiro acesso.");
    diagnostic("resend_sent", { studentId: student.id, origin: input.origin });
    await audit(supabase, "email_primeiro_acesso_enviado", student.id, { origem: input.origin });
    return { created: true, reason: "sent" as const };
  } catch (error) {
    const message = error instanceof Error ? error.message.replace(/senha[^.]*/gi, "credencial ocultada").slice(0, 500) : "Falha desconhecida";
    await supabase.from("alunos_primeiro_acesso_envios").update({ status: "falhou", erro: message }).eq("aluno_id", student.id);
    await audit(supabase, "email_primeiro_acesso_falhou", student.id, { origem: input.origin, motivo: message });
    throw error;
  }
}
