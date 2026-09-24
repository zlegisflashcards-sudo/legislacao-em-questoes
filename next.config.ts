import type { NextConfig } from "next";

// sql.js publica um wrapper UMD; no bundle da rota ele perde o CommonJS `module`.
// Mantê-lo externo garante a avaliação pelo runtime Node real.
const nextConfig: NextConfig = {
  // Permite validar uma compilação de produção sem disputar `.next` com o
  // servidor de desenvolvimento que pode estar aberto no painel local.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  serverExternalPackages: ["sql.js", "ankipack", "pdfjs-dist"],
  // A rota gera o arquivo APKG sob demanda. Como sql.js permanece externo ao
  // bundle, o rastreador não descobre o WebAssembly carregado dinamicamente.
  // Incluí-lo explicitamente evita que a função serverless seja publicada sem
  // o runtime SQLite necessário para criar o deck.
  outputFileTracingIncludes: {
    "/api/aluno/estudar/lei/[slug]/anki/download": [
      // Evita incluir o symlink de node_modules no pacote serverless. O
      // arquivo físico é o que `require.resolve` encontra no runtime pnpm.
      "./node_modules/.pnpm/sql.js@1.14.2/node_modules/sql.js/dist/sql-wasm.wasm",
    ],
    "/api/legiscast/pdf-worker": [
      "./node_modules/.pnpm/pdfjs-dist@5.4.624/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
    ],
  },
};

export default nextConfig;
