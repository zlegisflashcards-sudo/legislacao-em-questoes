import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const runtime = "nodejs";

export async function GET() {
  // Deve apontar para o mesmo arquivo físico declarado em
  // outputFileTracingIncludes. O symlink node_modules/pdfjs-dist não é
  // preservado no runtime serverless, mas o pacote físico do pnpm é.
  const file = join(process.cwd(), "node_modules", ".pnpm", "pdfjs-dist@5.4.624", "node_modules", "pdfjs-dist", "legacy", "build", "pdf.worker.mjs");
  const source = await readFile(file);
  return new Response(source, {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
