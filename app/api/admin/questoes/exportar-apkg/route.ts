import { NextResponse } from "next/server";
import { AdminQuestoesError } from "@/lib/admin-questoes-server";
import { exportLawApkg } from "@/lib/anki-apkg-export";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const noStore = { "Cache-Control": "no-store, max-age=0" };

export async function GET(request: Request) {
  try {
    const slug = new URL(request.url).searchParams.get("slug")?.trim();
    if (!slug) return NextResponse.json({ error: "Slug da lei é obrigatório." }, { status: 400, headers: noStore });

    const exported = await exportLawApkg(slug);
    const body = exported.bytes.buffer.slice(exported.bytes.byteOffset, exported.bytes.byteOffset + exported.bytes.byteLength) as ArrayBuffer;
    return new NextResponse(body, {
      headers: {
        ...noStore,
        "Content-Type": "application/vnd.anki",
        "Content-Disposition": `attachment; filename="${exported.filename}"`,
      },
    });
  } catch (error) {
    if (error instanceof AdminQuestoesError) {
      return NextResponse.json({ error: error.message }, { status: error.status, headers: noStore });
    }
    console.error("Falha interna ao exportar APKG administrativo.");
    return NextResponse.json({ error: "Não foi possível exportar o APKG." }, { status: 500, headers: noStore });
  }
}
