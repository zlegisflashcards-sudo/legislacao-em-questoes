import "server-only";
import { cookies } from "next/headers";
import { adminCookieNames, obterAdministrador } from "@/lib/admin-auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export class AcademicSessionError extends Error {
  constructor(public status: 401 | 500, public publicMessage: string) { super(publicMessage); }
}

function sessionFailureDetails(error: unknown) {
  const value = typeof error === "object" && error !== null ? error as Record<string, unknown> : {};
  return {
    name: typeof value.name === "string" ? value.name : "UnknownError",
    message: typeof value.message === "string" ? value.message : "erro desconhecido",
    code: typeof value.code === "string" ? value.code : null,
    status: typeof value.status === "number" ? value.status : null,
  };
}

function logAcademicSessionFailure(stage: string, request: Request, error: unknown) {
  console.error("academic_session_verification_failed", {
    stage,
    path: new URL(request.url).pathname,
    hasBearer: request.headers.has("authorization"),
    ...sessionFailureDetails(error),
  });
}

export async function authenticateAcademicSession(request: Request) {
  const authorization = request.headers.get("authorization");
  // Um Bearer enviado é sempre a identidade da requisição. Nunca substituí-lo por cookies ADM.
  if (authorization !== null) {
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
    if (!token) throw new AcademicSessionError(401, "Entre na sua conta para acessar este conteúdo.");
    let result;
    try { result = await getSupabaseServerClient().auth.getUser(token); }
    catch (error) {
      logAcademicSessionFailure("supabase_auth_get_user_threw", request, error);
      throw new AcademicSessionError(500, "Não foi possível verificar sua sessão agora. Tente novamente.");
    }
    const { data, error } = result;
    if (error) {
      const invalidCredentials = [400, 401, 403, 422].includes(error.status ?? 0)
        || ["bad_jwt", "session_not_found", "user_not_found"].includes(error.code ?? "");
      if (!invalidCredentials) logAcademicSessionFailure("supabase_auth_get_user_error", request, error);
      throw new AcademicSessionError(invalidCredentials ? 401 : 500, invalidCredentials
        ? "Sua sessão expirou. Entre novamente."
        : "Não foi possível verificar sua sessão agora. Tente novamente.");
    }
    if (!data.user) throw new AcademicSessionError(401, "Sua sessão expirou. Entre novamente.");
    return { user: data.user, token, cookieAdministrator: false };
  }
  const administrator = await obterAdministrador();
  if (!administrator) throw new AcademicSessionError(401, "Entre na sua conta para acessar este conteúdo.");
  const token = (await cookies()).get(adminCookieNames.access)?.value;
  if (!token) throw new AcademicSessionError(401, "Entre na sua conta para acessar este conteúdo.");
  return { user: administrator, token, cookieAdministrator: true };
}
