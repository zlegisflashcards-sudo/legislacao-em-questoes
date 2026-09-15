import { NextResponse } from "next/server";
import { obterAdministrador } from "@/lib/admin-auth";
import { handleCommercialGet, handleCommercialMutation } from "@/lib/commercial-admin-http";
import { getAdminLawBySlug } from "@/lib/admin-law-center-server";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store, max-age=0" };

async function lawContext(params: Promise<{ slug: string }>) {
  if (!await obterAdministrador()) return { response: NextResponse.json({ error: "Autenticação administrativa obrigatória." }, { status: 401, headers }) };
  return { law: await getAdminLawBySlug((await params).slug) };
}

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const context = await lawContext(params);
  if ("response" in context) return context.response;
  const { law } = context;
  if (!law) return NextResponse.json({ error: "Lei não encontrada." }, { status: 404 });
  const url = new URL(request.url); url.searchParams.set("lei_id", String(law.id));
  return handleCommercialGet("materiais", new Request(url, request));
}

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const context = await lawContext(params);
  if ("response" in context) return context.response;
  const { law } = context;
  if (!law) return NextResponse.json({ error: "Lei não encontrada." }, { status: 404 });
  return handleCommercialMutation("materiais", request, { lawId: law.id });
}
