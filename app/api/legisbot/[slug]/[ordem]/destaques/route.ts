import { CommunityApiError, requireRequestUser } from "@/lib/legisbot-community-server";
import { getStoredLegislationText, highlightJsonError } from "@/lib/legisbot-highlights-server";
import {
  isHighlightColor,
  normalizeHighlightIdentifiers,
  rangesOverlap,
  validateHighlightSelection,
} from "@/lib/legisbot-highlights";
import { createSupabaseUserClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ slug: string; ordem: string }> };

function accessToken(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

function serialize(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    start: Number(row.inicio),
    end: Number(row.fim),
    text: String(row.trecho),
    color: String(row.cor),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const route = await context.params;
    const { slug, ordem } = normalizeHighlightIdentifiers(route.slug, route.ordem);
    await requireRequestUser(request);
    const token = accessToken(request);
    const { data, error } = await createSupabaseUserClient(token)
      .from("legisbot_destaques_usuario")
      .select("id,inicio,fim,trecho,cor,created_at,updated_at")
      .eq("slug", slug)
      .eq("ordem", ordem)
      .order("inicio", { ascending: true });

    if (error) throw error;
    return Response.json({ success: true, highlights: (data ?? []).map(serialize) });
  } catch (error) {
    return highlightJsonError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const route = await context.params;
    const { slug, ordem } = normalizeHighlightIdentifiers(route.slug, route.ordem);
    const user = await requireRequestUser(request);
    const token = accessToken(request);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || !isHighlightColor(body.color)) {
      throw new CommunityApiError(400, "Escolha uma cor válida para o destaque.");
    }

    const legislationText = await getStoredLegislationText(slug, ordem);
    const validation = validateHighlightSelection(
      legislationText,
      body.start,
      body.end,
      body.text,
    );
    if (!validation.ok) throw new CommunityApiError(400, validation.message);

    const client = createSupabaseUserClient(token);
    const existingResult = await client
      .from("legisbot_destaques_usuario")
      .select("id,inicio,fim,trecho,cor,created_at,updated_at")
      .eq("slug", slug)
      .eq("ordem", ordem)
      .order("inicio", { ascending: true });
    if (existingResult.error) throw existingResult.error;

    const exact = (existingResult.data ?? []).find((item) => (
      Number(item.inicio) === validation.selection.start
      && Number(item.fim) === validation.selection.end
      && String(item.trecho) === validation.selection.text
    ));
    if (exact) {
      const updated = await client
        .from("legisbot_destaques_usuario")
        .update({ cor: body.color })
        .eq("id", exact.id)
        .select("id,inicio,fim,trecho,cor,created_at,updated_at")
        .single();
      if (updated.error) throw updated.error;
      return Response.json({ success: true, highlight: serialize(updated.data), replaced: true });
    }

    const overlaps = (existingResult.data ?? []).some((item) => rangesOverlap(
      validation.selection.start,
      validation.selection.end,
      Number(item.inicio),
      Number(item.fim),
    ));
    if (overlaps) {
      throw new CommunityApiError(409, "Esse trecho se sobrepõe a outro destaque. Remova o destaque existente ou selecione outro trecho.");
    }

    const inserted = await client
      .from("legisbot_destaques_usuario")
      .insert({
        user_id: user.id,
        slug,
        ordem,
        inicio: validation.selection.start,
        fim: validation.selection.end,
        trecho: validation.selection.text,
        cor: body.color,
      })
      .select("id,inicio,fim,trecho,cor,created_at,updated_at")
      .single();

    if (inserted.error?.code === "23P01" || inserted.error?.code === "23505") {
      throw new CommunityApiError(409, "Esse trecho já possui um destaque ou se sobrepõe a outro.");
    }
    if (inserted.error) throw inserted.error;
    return Response.json({ success: true, highlight: serialize(inserted.data), replaced: false }, { status: 201 });
  } catch (error) {
    return highlightJsonError(error);
  }
}
