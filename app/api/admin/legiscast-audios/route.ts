import { AdminLegiscastAudioError, listAdminLegiscastAudios, uploadAdminLegiscastAudio } from "@/lib/admin-legiscast-audios-server";

function failure(error: unknown) { const status = error instanceof AdminLegiscastAudioError ? error.status : 500; const message = error instanceof Error ? error.message : "Não foi possível concluir a operação."; return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } }); }
export async function GET() { try { return Response.json(await listAdminLegiscastAudios(), { headers: { "Cache-Control": "no-store" } }); } catch (error) { return failure(error); } }
export async function POST(request: Request) { try { if (!request.headers.get("content-type")?.includes("multipart/form-data")) throw new AdminLegiscastAudioError(415, "Envie o formulário de áudio."); return Response.json(await uploadAdminLegiscastAudio(await request.formData()), { headers: { "Cache-Control": "no-store" } }); } catch (error) { return failure(error); } }
