import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const runtime = "nodejs";

export async function GET() {
  // O arquivo é instalado como dependência direta. Evitamos `import ?url`,
  // que faz o webpack do Windows tentar gerar um caminho absoluto em `.next`.
  const file = join(process.cwd(), "node_modules", "pdfjs-dist", "legacy", "build", "pdf.worker.mjs");
  const source = await readFile(file);
  return new Response(source, {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
