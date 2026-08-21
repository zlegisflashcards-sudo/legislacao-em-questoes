import type { NextConfig } from "next";

// sql.js publica um wrapper UMD; no bundle da rota ele perde o CommonJS `module`.
// Mantê-lo externo garante a avaliação pelo runtime Node real.
const nextConfig: NextConfig = { serverExternalPackages: ["sql.js", "ankipack"] };

export default nextConfig;
