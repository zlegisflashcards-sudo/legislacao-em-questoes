import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createStudentActivationLink } from "@/lib/student-activation-server";

export type FirstAccessOrigin = "hotmart" | "administrativo" | "cortesia" | "amostra" | "premiacao" | "migracao";
type AccessInput = { studentId: string; origin: FirstAccessOrigin; idempotencyKey: string; accessLabel: string; kind?: "acquisition" | "release"; notificationOrigin?: "hotmart" | "aquisicao_manual" | "liberacao_manual" };
type StudentEmail = { id: string; nome: string | null; email: string; user_id: string | null };

function normalizedEmail(value: string) { return value.trim().toLowerCase(); }
function diagnostic(stage: string, details: Record<string, unknown>) { console.info("[student-access-notification]", { stage, ...details }); }

async function audit(supabase: SupabaseClient, action: string, studentId: string, details: Record<string, unknown>, actorUserId?: string) {
  const result = await supabase.from("auditoria_administrativa").insert({ ator_user_id: actorUserId ?? null, acao: action, entidade: "aluno", entidade_id: studentId, detalhes: details });
  if (result.error) throw new Error("Nao foi possivel registrar a auditoria de acesso.");
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

function accessNotificationText(name: string | null, label: string, hasAuth: boolean, activationUrl?: string) {
  const greeting = `Ola, ${name?.trim() || "aluno(a)"}.\n\nUm novo acesso foi liberado: ${label}.\n\n`;
  if (!hasAuth) {
    return `${greeting}Para comecar a estudar, ative sua conta:\n${activationUrl}\n\nAtivar minha conta`;
  }
  return `${greeting}Acesse sua area de estudos:\nhttps://www.legisflashcards.com.br/conta\n\nAcessar minha conta`;
}

/** Shared delivery layer for automatic event notifications and the explicit admin resend. */
async function deliverStudentAccessEmail(
  supabase: SupabaseClient,
  student: StudentEmail,
  input: { accessLabel: string; idempotencyKey: string; origin: string; eventId: string },
) {
  const hasAuth = Boolean(student.user_id);
  const type = hasAuth ? "acessar_conta" : "ativar_conta";
  const email = normalizedEmail(student.email);
  console.info("[student-access-email]", { stage: "resend_started", origem: input.origin, event_id: input.eventId, aluno_id: student.id, email, possui_auth: hasAuth, tipo: type });
  try {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM_EMAIL;
    if (!apiKey || !from) throw new Error("Configuracao do e-mail de acesso indisponivel.");
    const activationUrl = hasAuth ? undefined : await createStudentActivationLink(supabase, student.id);
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": input.idempotencyKey },
      body: JSON.stringify({ from, to: [email], subject: "Acesso disponivel na Legislacao em Questoes", text: accessNotificationText(student.nome, input.accessLabel, hasAuth, activationUrl) }),
    });
    const diagnostic = resendDiagnosticBody(await response.text());
    console.info("[student-access-email]", { stage: response.ok ? "resend_sent" : "resend_failed", origem: input.origin, event_id: input.eventId, aluno_id: student.id, email, possui_auth: hasAuth, tipo: type, status_http: response.status, ...diagnostic });
    if (!response.ok) throw new Error(`Falha do servico de e-mail (HTTP ${response.status}).`);
    return { type, statusHttp: response.status, resendCode: diagnostic.code };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Falha desconhecida";
    console.error("[student-access-email]", { stage: "resend_failed", origem: input.origin, event_id: input.eventId, aluno_id: student.id, email, possui_auth: hasAuth, tipo: type, message });
    throw error;
  }
}

async function sendNewAccessNotification(
  supabase: SupabaseClient,
  student: StudentEmail,
  input: AccessInput,
) {
  const type = input.kind === "release" ? "nova_liberacao" : "nova_aquisicao";
  const reserve = await supabase.from("alunos_notificacoes_acesso").insert({ aluno_id: student.id, idempotency_key: input.idempotencyKey, tipo: type, origem: input.origin, descricao: input.accessLabel, status: "reservado" });
  if (reserve.error?.code === "23505") return { created: false, reason: "notification_already_reserved" as const };
  if (reserve.error) throw new Error("Nao foi possivel reservar a notificacao de novo acesso.");
  try {
    const delivery = await deliverStudentAccessEmail(supabase, student, { accessLabel: input.accessLabel, idempotencyKey: input.idempotencyKey, origin: input.notificationOrigin ?? input.origin, eventId: input.idempotencyKey });
    const sent = await supabase.from("alunos_notificacoes_acesso").update({ status: "enviado", enviado_em: new Date().toISOString(), erro: null }).eq("idempotency_key", input.idempotencyKey);
    if (sent.error) throw new Error("Nao foi possivel registrar a notificacao enviada.");
    await audit(supabase, "notificacao_novo_acesso_enviada", student.id, { origem: input.notificationOrigin ?? input.origin, tipo: type, descricao: input.accessLabel, possui_auth: Boolean(student.user_id), resend_code: delivery.resendCode, status_http: delivery.statusHttp, event_id: input.idempotencyKey });
    return { created: true, reason: "access_notification_sent" as const };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Falha desconhecida";
    await supabase.from("alunos_notificacoes_acesso").update({ status: "falhou", erro: message }).eq("idempotency_key", input.idempotencyKey);
    await audit(supabase, "notificacao_novo_acesso_falhou", student.id, { origem: input.notificationOrigin ?? input.origin, tipo: type, motivo: message, possui_auth: Boolean(student.user_id), event_id: input.idempotencyKey });
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
  const idempotencyKey = `administrativo-email-acesso:${randomUUID()}`;
  try {
    const delivery = await deliverStudentAccessEmail(supabase, { ...student, email: normalizedEmail(String(student.email)) }, { accessLabel: "seus acessos", idempotencyKey, origin: "manual_admin", eventId: idempotencyKey });
    await audit(supabase, "email_acesso_manual_enviado", student.id, { tipo: delivery.type, status_http: delivery.statusHttp, resend_code: delivery.resendCode }, actorUserId);
    return { sent: true, type: delivery.type };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Falha desconhecida";
    await audit(supabase, "email_acesso_manual_falhou", student.id, { motivo: message }, actorUserId);
    throw error;
  }
}
