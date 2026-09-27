import { studentCenterDetail } from "@/lib/student-center-server";
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) { try { return Response.json(await studentCenterDetail((await params).id)); } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Falha ao carregar aluno." }, { status: 404 }); } }
