import { sanitizarHtmlLegislacao } from "@/lib/legisbot/sanitize-legal-html";
import {
  COMMUNITY_PAGE_SIZE,
  COMMUNITY_QUOTE_MAX_LENGTH,
  legalHtmlToPlainText,
  normalizeCommunityIdentifiers,
  validateCommunityContent,
  type CommunityComment,
  type CommunitySort,
  type CommunityStatus,
} from "@/lib/legisbot-community";
import {
  CommunityApiError,
  communityJsonError,
  getRequestUser,
  requirePublicProfile,
  requireRequestUser,
} from "@/lib/legisbot-community-server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { usuarioEhAdministrador } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ slug: string; ordem: string }> };
type DbComment = {
  id: string;
  user_id: string;
  parent_id: string | null;
  respondendo_a_user_id: string | null;
  conteudo: string | null;
  trecho_citado: string | null;
  trecho_destacado_inicio: number | null;
  trecho_destacado_fim: number | null;
  status: CommunityStatus;
  curtidas_count: number;
  created_at: string;
  updated_at: string;
  publicado_como_equipe: boolean;
};

async function getThreadLaw(slug: string, ordem: string) {
  const { data, error } = await getSupabaseServerClient()
    .from("legisbot_comentarios")
    .select("legislacao")
    .eq("slug", slug)
    .eq("ordem", ordem)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new CommunityApiError(404, "Trecho não encontrado.");
  const legislation = legalHtmlToPlainText(sanitizarHtmlLegislacao(String(data.legislacao ?? "")));
  if (!legislation) throw new CommunityApiError(409, "O texto legal deste trecho está indisponível.");
  return legislation;
}

function serializeComment(
  row: DbComment,
  names: Map<string, string>,
  currentUserId: string | null,
  likedIds: Set<string>,
): CommunityComment {
  return {
    id: row.id,
    parentId: row.parent_id,
    content: row.status === "removido" ? null : row.conteudo,
    quotedText: row.status === "removido" ? null : row.trecho_citado,
    quoteStart: row.trecho_destacado_inicio,
    quoteEnd: row.trecho_destacado_fim,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    edited: row.updated_at !== row.created_at,
    publicName: row.publicado_como_equipe ? "Legis Flashcards ✓" : names.get(row.user_id) ?? "Estudante Legis",
    replyingToName: row.respondendo_a_user_id ? names.get(row.respondendo_a_user_id) ?? null : null,
    likeCount: row.curtidas_count,
    likedByMe: likedIds.has(row.id),
    isOwn: currentUserId === row.user_id,
    official: row.publicado_como_equipe,
    replies: [],
  };
}

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const route = await params;
    const { slug, ordem } = normalizeCommunityIdentifiers(route.slug, route.ordem);
    const url = new URL(request.url);
    const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
    const requestedSort = url.searchParams.get("sort") as CommunitySort | null;
    const sort: CommunitySort = ["relevant", "recent", "oldest"].includes(requestedSort ?? "")
      ? requestedSort!
      : "relevant";
    const user = await getRequestUser(request);
    const supabase = getSupabaseServerClient();
    const start = (page - 1) * COMMUNITY_PAGE_SIZE;

    let rootsQuery = supabase
      .from("legisbot_comentarios_comunidade")
      .select("id,user_id,parent_id,respondendo_a_user_id,conteudo,trecho_citado,trecho_destacado_inicio,trecho_destacado_fim,status,curtidas_count,created_at,updated_at,publicado_como_equipe", { count: "exact" })
      .eq("slug", slug)
      .eq("ordem", ordem)
      .is("parent_id", null)
      .in("status", ["publicado", "removido"]);

    if (sort === "relevant") rootsQuery = rootsQuery.order("curtidas_count", { ascending: false }).order("created_at", { ascending: false });
    if (sort === "recent") rootsQuery = rootsQuery.order("created_at", { ascending: false });
    if (sort === "oldest") rootsQuery = rootsQuery.order("created_at", { ascending: true });

    const { data: rootsData, error: rootsError, count } = await rootsQuery.range(start, start + COMMUNITY_PAGE_SIZE - 1);
    if (rootsError) throw rootsError;
    const roots = (rootsData ?? []) as DbComment[];
    const rootIds = roots.map((row) => row.id);
    let replies: DbComment[] = [];
    if (rootIds.length) {
      const result = await supabase
        .from("legisbot_comentarios_comunidade")
        .select("id,user_id,parent_id,respondendo_a_user_id,conteudo,trecho_citado,trecho_destacado_inicio,trecho_destacado_fim,status,curtidas_count,created_at,updated_at,publicado_como_equipe")
        .in("parent_id", rootIds)
        .in("status", ["publicado", "removido"])
        .order("created_at", { ascending: true });
      if (result.error) throw result.error;
      replies = (result.data ?? []) as DbComment[];
    }

    const allRows = [...roots, ...replies];
    const userIds = [...new Set(allRows.flatMap((row) => [row.user_id, row.respondendo_a_user_id].filter(Boolean) as string[]))];
    const names = new Map<string, string>();
    if (userIds.length) {
      const profiles = await supabase.from("perfis_publicos").select("id,nome_publico").in("id", userIds);
      if (profiles.error) throw profiles.error;
      for (const profile of profiles.data ?? []) names.set(String(profile.id), String(profile.nome_publico));
    }

    const likedIds = new Set<string>();
    if (user && allRows.length) {
      const likes = await supabase
        .from("legisbot_comentarios_curtidas")
        .select("comentario_id")
        .eq("user_id", user.id)
        .in("comentario_id", allRows.map((row) => row.id));
      if (likes.error) throw likes.error;
      for (const like of likes.data ?? []) likedIds.add(String(like.comentario_id));
    }

    const serializedRoots = roots.map((row) => serializeComment(row, names, user?.id ?? null, likedIds));
    const rootsById = new Map(serializedRoots.map((row) => [row.id, row]));
    for (const reply of replies) {
      const parent = reply.parent_id ? rootsById.get(reply.parent_id) : null;
      if (parent) parent.replies.push(serializeComment(reply, names, user?.id ?? null, likedIds));
    }

    return Response.json({
      success: true,
      comments: serializedRoots.filter((row) => row.status !== "removido" || row.replies.length > 0),
      total: count ?? 0,
      page,
      pageSize: COMMUNITY_PAGE_SIZE,
      hasMore: start + roots.length < (count ?? 0),
      legislationText: await getThreadLaw(slug, ordem),
      authenticated: Boolean(user),
      canPublishOfficial: usuarioEhAdministrador(user),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return communityJsonError(error);
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const route = await params;
    const { slug, ordem } = normalizeCommunityIdentifiers(route.slug, route.ordem);
    const user = await requireRequestUser(request);
    await requirePublicProfile(user.id);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) throw new CommunityApiError(400, "Dados do comentário inválidos.");
    const validation = validateCommunityContent(String(body.content ?? ""));
    if (!validation.ok) throw new CommunityApiError(400, validation.message);
    const legislation = await getThreadLaw(slug, ordem);
    const publishAsTeam = body.publishAsTeam === true;
    if (publishAsTeam && !usuarioEhAdministrador(user)) {
      throw new CommunityApiError(403, "Somente administradores podem publicar como Legis Flashcards.");
    }

    let quotedText: string | null = null;
    let quoteStart: number | null = null;
    let quoteEnd: number | null = null;
    const hasQuote = body.quotedText !== null && body.quotedText !== undefined && String(body.quotedText) !== "";
    if (hasQuote) {
      quotedText = String(body.quotedText);
      quoteStart = Number(body.quoteStart);
      quoteEnd = Number(body.quoteEnd);
      if (!Number.isInteger(quoteStart) || !Number.isInteger(quoteEnd) || quoteStart! < 0 || quoteEnd! <= quoteStart! || quoteEnd! > legislation.length) {
        throw new CommunityApiError(400, "O trecho destacado é inválido.");
      }
      if (quotedText.length > COMMUNITY_QUOTE_MAX_LENGTH || legislation.slice(quoteStart!, quoteEnd!) !== quotedText) {
        throw new CommunityApiError(400, "O trecho destacado não corresponde à legislação original.");
      }
    }

    const supabase = getSupabaseServerClient();
    let parentId: string | null = null;
    let replyingToUserId: string | null = null;
    const requestedParentId = typeof body.parentId === "string" ? body.parentId : null;
    if (requestedParentId) {
      const parentResult = await supabase
        .from("legisbot_comentarios_comunidade")
        .select("id,user_id,parent_id,slug,ordem,status")
        .eq("id", requestedParentId)
        .maybeSingle();
      if (parentResult.error) throw parentResult.error;
      const parent = parentResult.data;
      if (!parent || parent.slug !== slug || parent.ordem !== ordem || parent.status !== "publicado") {
        throw new CommunityApiError(400, "O comentário respondido não está disponível.");
      }
      parentId = parent.parent_id ?? parent.id;
      replyingToUserId = parent.user_id;
    }

    const recent = await supabase
      .from("legisbot_comentarios_comunidade")
      .select("conteudo,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (recent.error) throw recent.error;
    if (recent.data) {
      const elapsed = Date.now() - Date.parse(String(recent.data.created_at));
      if (elapsed < 15_000) throw new CommunityApiError(429, "Aguarde alguns segundos antes de publicar novamente.");
      if (elapsed < 10 * 60_000 && String(recent.data.conteudo).trim() === validation.content) {
        throw new CommunityApiError(409, "Este comentário já foi publicado.");
      }
    }

    const result = await supabase.from("legisbot_comentarios_comunidade").insert({
      user_id: user.id,
      slug,
      ordem,
      conteudo: validation.content,
      trecho_citado: quotedText,
      trecho_destacado_inicio: quoteStart,
      trecho_destacado_fim: quoteEnd,
      parent_id: parentId,
      respondendo_a_user_id: replyingToUserId,
      status: "publicado",
      publicado_como_equipe: publishAsTeam,
    });
    if (result.error) throw result.error;
    return Response.json({ success: true, message: "Comentário publicado." }, { status: 201 });
  } catch (error) {
    return communityJsonError(error);
  }
}
