import "server-only";

import { createSupabaseUserClient, getSupabaseServerClient } from "@/lib/supabase-server";
import { parseStudentLawRows, type StudentLaw } from "@/lib/student-laws";

export class StudentLawsApiError extends Error {
  constructor(public status: number, public publicMessage: string) {
    super(publicMessage);
  }
}

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return null;
  return authorization.slice(7).trim() || null;
}

export async function loadStudentLaws(request: Request): Promise<StudentLaw[]> {
  const url = new URL(request.url);
  if (url.searchParams.has("aluno_id")) {
    throw new StudentLawsApiError(400, "Parâmetro não permitido.");
  }

  const token = bearerToken(request);
  if (!token) throw new StudentLawsApiError(401, "Entre na sua conta para acessar suas leis.");

  const { data: userData, error: userError } = await getSupabaseServerClient().auth.getUser(token);
  if (userError || !userData.user) {
    throw new StudentLawsApiError(401, "Sua sessão expirou. Entre novamente.");
  }

  const { data: student, error: studentError } = await getSupabaseServerClient().from("alunos").select("deve_trocar_senha").eq("user_id", userData.user.id).maybeSingle();
  if (studentError) throw new StudentLawsApiError(503, "Não foi possível verificar seu acesso agora.");
  if (student?.deve_trocar_senha === true) throw new StudentLawsApiError(403, "Crie sua nova senha antes de acessar suas leis.");

  const { data, error } = await createSupabaseUserClient(token).rpc("obter_minhas_leis");
  if (error) throw new StudentLawsApiError(503, "Não foi possível carregar suas leis agora.");
  return parseStudentLawRows(data);
}

export function studentLawsErrorResponse(error: unknown) {
  if (error instanceof StudentLawsApiError) {
    return Response.json({ success: false, message: error.publicMessage }, {
      status: error.status,
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  }
  console.error("Falha ao carregar leis do aluno", error instanceof Error ? error.message : "erro desconhecido");
  return Response.json({ success: false, message: "Não foi possível concluir a operação." }, {
    status: 500,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}
