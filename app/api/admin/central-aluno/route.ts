import { StudentCenterHttpError, studentCenterAction, studentCenterList } from "@/lib/student-center-server";
import { StudentProvisionalPasswordError } from "@/lib/student-provisional-password-server";
function failure(error: unknown, fallback: string, status = 500) { return Response.json({ error: error instanceof Error ? error.message : fallback }, { status: error instanceof StudentCenterHttpError || error instanceof StudentProvisionalPasswordError ? error.status : status }); }
export async function GET(request: Request) { try { return Response.json(await studentCenterList(new URL(request.url))); } catch (error) { return failure(error, "Falha ao carregar alunos."); } }
export async function POST(request: Request) { try { return Response.json(await studentCenterAction(await request.json())); } catch (error) { return failure(error, "Falha ao executar ação.", 400); } }
