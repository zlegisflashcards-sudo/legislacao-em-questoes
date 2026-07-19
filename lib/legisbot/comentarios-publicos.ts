import { supabase } from "@/lib/supabase";

const TABELA = "legisbot_comentarios";

export type ComentarioPublicoLegisBot = {
  slug: string;
  ordem: string;
  assunto: string | null;
  titulo: string | null;
};

export function removerComentariosDuplicados(
  comentarios: ComentarioPublicoLegisBot[],
) {
  const chaves = new Set<string>();

  return comentarios.filter((comentario) => {
    const chave = `${comentario.slug}:${comentario.ordem}`;

    if (chaves.has(chave)) return false;

    chaves.add(chave);
    return true;
  });
}

export async function buscarComentariosPublicosPorSlug(slug: string) {
  const slugNormalizado = slug.trim().toUpperCase();

  if (!slugNormalizado) return [];

  const { data, error } = await supabase
    .from(TABELA)
    .select("slug,ordem,assunto,titulo")
    .eq("slug", slugNormalizado)
    .eq("status", "concluido")
    .not("comentario", "is", null)
    .neq("comentario", "")
    .order("ordem", { ascending: true });

  if (error) {
    console.error("Erro ao listar comentários públicos do LegisBot:", {
      slug: slugNormalizado,
      message: error.message,
    });
    return [];
  }

  return removerComentariosDuplicados(
    (data ?? []) as ComentarioPublicoLegisBot[],
  );
}
