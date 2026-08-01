import "server-only";

import { getSupabaseServerClient } from "@/lib/supabase-server";
import type { DetalhesErroOpenAI } from "./openai-error";
import {
  processarAlertaCotaOpenAI,
  type ContextoAlertaCotaOpenAI,
} from "./openai-quota-alert-core";

const ALERT_KEY = "openai-insufficient-quota";
const BILLING_URL = "https://platform.openai.com/settings/organization/billing/overview";

function emailsAdministrativos(): string[] {
  const configuracao =
    process.env.LEGISBOT_ALERT_EMAIL_TO?.trim() ||
    process.env.LEGISBOT_ADMIN_EMAILS?.trim() ||
    process.env.LEGISBOT_ADMIN_EMAIL?.trim() ||
    "";

  return configuracao
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function siteUrl(): string {
  const url =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.VERCEL_PROJECT_PRODUCTION_URL ??
    process.env.VERCEL_URL;

  if (!url) return "https://www.legisflashcards.com.br";
  return url.startsWith("http") ? url.replace(/\/$/, "") : `https://${url.replace(/\/$/, "")}`;
}

async function reservarJanela(janelaMs: number): Promise<boolean> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.rpc("reservar_alerta_legisbot", {
    p_chave: ALERT_KEY,
    p_janela_segundos: Math.floor(janelaMs / 1000),
  });

  if (error) throw new Error("Não foi possível reservar o alerta administrativo.");
  return data === true;
}

function montarTextoEmail(
  contexto: ContextoAlertaCotaOpenAI,
  detalhes: DetalhesErroOpenAI,
): string {
  const dataLocal = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "full",
    timeStyle: "long",
    timeZone: "America/Sao_Paulo",
  }).format(contexto.occurredAt);

  return [
    "O LegisBot encontrou uma indisponibilidade por falta de créditos/cota na OpenAI.",
    "",
    `Data e horário: ${dataLocal}`,
    `Slug: ${contexto.slug}`,
    `Ordem: ${contexto.ordem}`,
    `Título: ${contexto.titulo?.trim() || "não informado"}`,
    `Assunto: ${contexto.assunto?.trim() || "não informado"}`,
    `Código do erro: ${detalhes.code || "não informado"}`,
    `Tipo do erro: ${detalhes.type || "não informado"}`,
    `Status HTTP da OpenAI: ${detalhes.status ?? "não informado"}`,
    `Mensagem técnica: ${detalhes.technicalMessage}`,
    "",
    `Painel administrativo: ${siteUrl()}/admin/legisbot`,
    `Faturamento da OpenAI: ${BILLING_URL}`,
  ].join("\n");
}

async function enviarEmail(
  contexto: ContextoAlertaCotaOpenAI,
  detalhes: DetalhesErroOpenAI,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  const to = emailsAdministrativos();

  if (!apiKey || !from || to.length === 0) {
    throw new Error("Configuração do e-mail administrativo indisponível.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject: "⚠️ LegisBot sem créditos na OpenAI",
      text: montarTextoEmail(contexto, detalhes),
    }),
  });

  if (!response.ok) {
    throw new Error(`Falha do serviço de e-mail (HTTP ${response.status}).`);
  }
}

export async function enviarAlertaFaltaDeCreditosOpenAI(
  contexto: Omit<ContextoAlertaCotaOpenAI, "occurredAt">,
  detalhes: DetalhesErroOpenAI,
) {
  return processarAlertaCotaOpenAI(
    { ...contexto, occurredAt: new Date() },
    detalhes,
    { reservar: reservarJanela, enviar: enviarEmail, log: console },
  );
}
