import "server-only";
import { buildLawApkg } from "@/lib/anki-apkg-export";
import { authorizeLawQuestionScope } from "@/lib/law-question-scope-auth";
import { resolveQuestionsForLawScope } from "@/lib/law-question-scopes";
import { mainStructure } from "@/lib/questions-main-server";
import { LawStudyApiError } from "@/lib/law-study-server";

function fileName(slug: string, recorteId: string | null) { return `${slug}${recorteId ? `-${recorteId.slice(0, 8)}` : ""}.apkg`; }
export async function downloadAuthorizedLawScopeApkg(request: Request, slug: string, recorteId: string | null) {
  const context = await authorizeLawQuestionScope(request, slug, recorteId);
  const [questions, structure] = await Promise.all([resolveQuestionsForLawScope(context.lawId, recorteId), mainStructure(context.lawId)]);
  if (!questions.length) throw new LawStudyApiError(422, "Nenhum flashcard disponível para este conteúdo.");
  const title = context.recorte ? `LegisFlashcards - ${context.title} - ${context.recorte.nome}` : `LegisFlashcards - ${context.title}`;
  const exported = await buildLawApkg({ slug, titulo: title }, questions, structure, { fileName: fileName(slug, recorteId) });
  const body = exported.bytes.buffer.slice(exported.bytes.byteOffset, exported.bytes.byteOffset + exported.bytes.byteLength) as ArrayBuffer;
  return new Response(body, { headers: { "Cache-Control": "private, no-store, max-age=0", "Content-Type": "application/vnd.anki", "Content-Disposition": `attachment; filename="${exported.filename}"`, "X-Content-Type-Options": "nosniff" } });
}
