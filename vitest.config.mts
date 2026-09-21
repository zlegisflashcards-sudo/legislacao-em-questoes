import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: { alias: { "@": resolve(import.meta.dirname, ".") } },
  test: {
    // A Central da Lei é um repositório Git independente, já publicado pelo
    // próprio pipeline. Ela não é importada por esta aplicação principal.
    exclude: ["**/node_modules/**", "**/legislacao-em-questoes/**"],
  },
});
