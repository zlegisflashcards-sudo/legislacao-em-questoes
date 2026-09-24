import { downloadCustomDeck, previewCustomDeck } from "@/lib/law-anki-custom-deck-server";
import { lawStudyErrorResponse } from "@/lib/law-study-server";
export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) { try { return Response.json(await previewCustomDeck(request, (await params).slug, await request.json()), { headers: { "Cache-Control": "private, no-store, max-age=0" } }); } catch (error) { return lawStudyErrorResponse(error); } }
export async function PUT(request: Request, { params }: { params: Promise<{ slug: string }> }) { try { return await downloadCustomDeck(request, (await params).slug, await request.json()); } catch (error) { return lawStudyErrorResponse(error); } }
