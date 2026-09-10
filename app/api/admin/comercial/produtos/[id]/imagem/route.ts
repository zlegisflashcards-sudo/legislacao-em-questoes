import { obterAdministrador } from "@/lib/admin-auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";

const BUCKET = "records-images";
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const extensions: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const productIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function failure(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await obterAdministrador();
    if (!admin) return failure("Autenticação administrativa obrigatória.", 401);
    const productId = (await params).id;
    if (!productIdPattern.test(productId)) return failure("Produto inválido.", 400);
    const form = await request.formData();
    const image = form.get("image");
    if (!(image instanceof File) || !image.size) return failure("Selecione uma imagem PNG, JPEG ou WebP.", 400);
    if (!(image.type in extensions)) return failure("Formato inválido. Envie PNG, JPEG ou WebP.", 415);
    if (image.size > MAX_IMAGE_BYTES) return failure("A imagem deve ter no máximo 3 MB.", 413);

    const db = getSupabaseServerClient();
    const { data: product, error: productError } = await db.from("produtos").select("id").eq("id", productId).maybeSingle();
    if (productError) throw productError;
    if (!product) return failure("Produto não encontrado.", 404);

    const extension = extensions[image.type];
    const path = `${product.id}/cover.${extension}`;
    const uploaded = await db.storage.from(BUCKET).upload(path, image, { contentType: image.type, upsert: true, cacheControl: "3600" });
    if (uploaded.error) throw uploaded.error;
    const { data: publicUrl } = db.storage.from(BUCKET).getPublicUrl(path);
    if (!publicUrl.publicUrl) throw new Error("Não foi possível obter a URL pública da imagem.");

    const saved = await db.rpc("admin_atualizar_produto", { p_ator_user_id: admin.id, p_produto_id: product.id, p_dados: { imagem_url: publicUrl.publicUrl } });
    if (saved.error) throw saved.error;
    const obsoletePaths = ["png", "jpg", "webp"].map((item) => `${product.id}/cover.${item}`).filter((item) => item !== path);
    const removed = await db.storage.from(BUCKET).remove(obsoletePaths);
    if (removed.error) console.warn("Não foi possível remover versões antigas da imagem de Records", { productId: product.id, message: removed.error.message });
    return Response.json({ imagem_url: publicUrl.publicUrl }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Falha no upload de imagem de Records", error instanceof Error ? error.message : "erro desconhecido");
    return failure("Não foi possível enviar a imagem do concurso.", 500);
  }
}
