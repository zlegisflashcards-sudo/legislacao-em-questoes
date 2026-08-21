import "server-only";

import { exportLawContentApkg } from "@/lib/anki-apkg-export";
import { authorizeLawStudy, LawStudyApiError } from "@/lib/law-study-server";

export async function downloadAuthorizedLawApkg(request: Request, slug: string) {
  try {
    await authorizeLawStudy(request, slug);
  } catch (error) {
    if (error instanceof LawStudyApiError && error.status === 404) throw new LawStudyApiError(403, "Você não possui acesso a esta lei.");
    throw error;
  }

  let exported;
  try {
    exported = await exportLawContentApkg(slug);
  } catch (error) {
    if (error instanceof Error && error.message === "Esta lei ainda não possui questões disponíveis para exportação.") throw new LawStudyApiError(422, error.message);
    if (error instanceof Error && error.message.includes("contém mídia")) throw new LawStudyApiError(422, error.message);
    throw error;
  }
  const body = exported.bytes.buffer.slice(exported.bytes.byteOffset, exported.bytes.byteOffset + exported.bytes.byteLength) as ArrayBuffer;
  return new Response(body, {
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Type": "application/vnd.anki",
      "Content-Disposition": `attachment; filename="${exported.filename}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
