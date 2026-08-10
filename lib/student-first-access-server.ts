import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export type FirstAccessOrigin = "hotmart" | "administrativo" | "cortesia" | "amostra" | "premiacao" | "migracao";
type AccessInput = { studentId: string; origin: FirstAccessOrigin; idempotencyKey: string; accessLabel: string; kind?: "acquisition" | "release" };

function normalizedEmail(value: string) { return value.trim().toLowerCase(); }
function diagnostic(stage: string, details: Record<string, unknown>) { console.info("[student-access-notification]", { stage, ...details }); }

async function audit(supabase: SupabaseClient, action: string, studentId: string, details: Record<string, unknown>, actorUserId?: string) {
  const result = await supabase.from("auditoria_administrativa").insert({ ator_user_id: actorUserId ?? null, acao: action, entidade: "aluno", entidade_id: studentId, detalhes: details });
  if (result.error) throw new Error("Nao foi possivel registrar a auditoria de acesso.");
}

async function sendEmail(to: string, subject: string, text: string, idempotencyKey: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) throw new Error("Configuracao do e-mail de acesso indisponivel.");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({ from, to: [to], subject, text }),
  });
  if (!response.ok) throw new Error(`Falha do servico de e-mail (HTTP ${response.status}).`);
}

function resendDiagnosticBody(body: string) {
  try {
    const parsed = JSON.parse(body) as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown };
    return {
      code: typeof parsed.code === "string" ? parsed.code : null,
      message: typeof parsed.message === "string" ? parsed.message : null,
      details: typeof parsed.details === "string" ? parsed.details : null,
      hint: typeof parsed.hint === "string" ? parsed.hint : null,
    };
  } catch {
    return { code: null, message: body.slice(0, 500) || null, details: null, hint: null };
  }
}

function accessNotificationText(name: string | null, label: string, hasAuth: boolean) {
  const greeting = `Ola, ${name?.trim() || "aluno(a)"}.\n\nUm novo acesso foi liberado: ${label}.\n\n`;
  if (!hasAuth) {
    return `${greeting}Para comecar a estudar, ative sua conta:\nhttps://www.legisflashcards.com.br/conta\n\nAtivar minha conta`;
  }
  return `${greeting}Acesse sua area de estudos:\nhttps://www.legisflashcards.com.br/conta\n\nAcessar minha conta`;
}

async function sendNewAccessNotification(
  supabase: SupabaseClient,
  student: { id: string; nome: string | null; email: string; user_id: string | null },
  input: AccessInput,
) {
  const type = input.kind === "release" ? "nova_liberacao" : "nova_aquisicao";
  const reserve = await supabase.from("alunos_notificacoes_acesso").insert({ aluno_id: student.id, idempotency_key: input.idempotencyKey, tipo: type, origem: input.origin, descricao: input.accessLabel, status: "reservado" });
  if (reserve.error?.code === "23505") return { created: false, reason: "notification_already_reserved" as const };
  if (reserve.error) throw new Error("Nao foi possivel reservar a notificacao de novo acesso.");
  try {
    diagnostic("access_notification_requested", { studentId: student.id, origin: input.origin, idempotencyKey: input.idempotencyKey, hasAuth: Boolean(student.user_id) });
    await sendEmail(student.email, "Novo acesso liberado na Legislacao em Questoes", accessNotificationText(student.nome, input.accessLabel, Boolean(student.user_id)), input.idempotencyKey);
    const sent = await supabase.from("alunos_notificacoes_acesso").update({ status: "enviado", enviado_em: new Date().toISOString(), erro: null }).eq("idempotency_key", input.idempotencyKey);
    if (sent.error) throw new Error("Nao foi possivel registrar a notificacao enviada.");
    await audit(supabase, "notificacao_novo_acesso_enviada", student.id, { origem: input.origin, tipo: type, descricao: input.accessLabel, possui_auth: Boolean(student.user_id) });
    return { created: true, reason: "access_notification_sent" as const };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Falha desconhecida";
    await supabase.from("alunos_notificacoes_acesso").update({ status: "falhou", erro: message }).eq("idempotency_key", input.idempotencyKey);
    await audit(supabase, "notificacao_novo_acesso_falhou", student.id, { origem: input.origin, tipo: type, motivo: message, possui_auth: Boolean(student.user_id) });
    throw error;
  }
}

/** Acquisition and release notifications never create or alter Supabase Auth. */
export async function notifyStudentAccess(supabase: SupabaseClient, input: AccessInput) {
  const studentResult = await supabase.from("alunos").select("id,user_id,nome,email").eq("id", input.studentId).single();
  if (studentResult.error || !studentResult.data) throw new Error("Aluno nao encontrado para a notificacao de acesso.");
  const student = studentResult.data;
  const email = normalizedEmail(String(student.email));
  const candidates = await supabase.from("alunos").select("id,email").ilike("email", `%${email}%`);
  if (candidates.error) throw new Error("Nao foi possivel validar a identidade do aluno.");
  if ((candidates.data ?? []).filter((item) => normalizedEmail(String(item.email)) === email).length !== 1) {
    await audit(supabase, "notificacao_novo_acesso_bloqueada", student.id, { origem: input.origin, motivo: "duplicidade_email" });
    throw new Error("Notificacao bloqueada: existe duplicidade historica para este e-mail.");
  }
  return sendNewAccessNotification(supabase, { ...student, email }, input);
}

/** Explicit administrative resend. It intentionally does not reserve an acquisition notification. */
export async function sendManualStudentAccessEmail(supabase: SupabaseClient, studentId: string, actorUserId: string) {
  const result = await supabase.from("alunos").select("id,user_id,nome,email").eq("id", studentId).single();
  if (result.error || !result.data) throw new Error("Aluno nao encontrado para o envio de e-mail.");
  const student = result.data;
  const email = normalizedEmail(String(student.email));
  const hasAuth = Boolean(student.user_id);
  const type = hasAuth ? "acessar_conta" : "ativar_conta";
  const idempotencyKey = `administrativo-email-acesso:${randomUUID()}`;
  console.info("[admin-access-email]", { stage: "resend_started", aluno_id: student.id, email, possui_auth: hasAuth, tipo: type });
  try {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM_EMAIL;
    if (!apiKey || !from) throw new Error("Configuracao do e-mail de acesso indisponivel.");
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({ from, to: [email], subject: "Acesso disponivel na Legislacao em Questoes", text: accessNotificationText(student.nome, "seus acessos", hasAuth) }),
    });
    const responseBody = await response.text();
    const diagnostic = resendDiagnosticBody(responseBody);
    console.info("[admin-access-email]", { stage: "resend_finished", aluno_id: student.id, email, possui_auth: hasAuth, tipo: type, status_http: response.status, ...diagnostic });
    if (!response.ok) throw new Error(`Falha do servico de e-mail (HTTP ${response.status}).`);
    await audit(supabase, "email_acesso_manual_enviado", student.id, { tipo: type, status_http: response.status, resend_code: diagnostic.code }, actorUserId);
    return { sent: true, type };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Falha desconhecida";
    console.error("[admin-access-email]", { stage: "resend_failed", aluno_id: student.id, email, possui_auth: hasAuth, tipo: type, message });
    await audit(supabase, "email_acesso_manual_falhou", student.id, { tipo: type, motivo: message }, actorUserId);
    throw error;
  }
}
