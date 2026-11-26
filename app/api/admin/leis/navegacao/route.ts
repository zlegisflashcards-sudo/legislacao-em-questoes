import { obterAdministrador } from "@/lib/admin-auth";
import { getAdminLawContextNavigation } from "@/lib/admin-law-center-server";

const headers = { "Cache-Control": "no-store, max-age=0" };

function validLawId(value: string | null) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function GET(request: Request) {
  if (!await obterAdministrador()) return Response.json({ error: "Autenticação administrativa obrigatória." }, { status: 401, headers });
  const params = new URL(request.url).searchParams;
  const lawId = validLawId(params.get("lawId"));
  if (!lawId) return Response.json({ error: "Lei inválida." }, { status: 400, headers });
  try {
    const navigation = await getAdminLawContextNavigation({
      lawId,
      query: params.get("q") ?? "",
      productId: params.get("produto") ?? "",
      category: params.get("categoria") ?? "",
      conference: params.get("conferencia") ?? "todas",
    });
    return Response.json(navigation, { headers });
  } catch {
    return Response.json({ error: "Não foi possível carregar a navegação do edital." }, { status: 500, headers });
  }
}
