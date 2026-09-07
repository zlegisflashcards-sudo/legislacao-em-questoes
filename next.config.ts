import type { NextConfig } from "next";

// sql.js publica um wrapper UMD; no bundle da rota ele perde o CommonJS `module`.
// Mantê-lo externo garante a avaliação pelo runtime Node real.
const nextConfig: NextConfig = {
  serverExternalPackages: ["sql.js", "ankipack"],
  // A rota gera o arquivo APKG sob demanda. Como sql.js permanece externo ao
  // bundle, o rastreador não descobre o WebAssembly carregado dinamicamente.
  // Incluí-lo explicitamente evita que a função serverless seja publicada sem
  // o runtime SQLite necessário para criar o deck.
  outputFileTracingIncludes: {
    "/api/aluno/estudar/lei/[slug]/anki/download": [
      "./node_modules/sql.js/dist/sql-wasm.js",
      "./node_modules/sql.js/dist/sql-wasm.wasm",
      "./node_modules/ankipack/dist/**/*",
    ],
  },
};

export default nextConfig;
