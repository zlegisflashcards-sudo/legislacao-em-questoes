import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const client = readFileSync("components/law-anki-page-client.tsx", "utf8");

describe("página Anki da lei", () => {
  it("apresenta os dois caminhos sem condicionar o download ao tutorial", () => {
    expect(client).toContain("Você já utiliza o Anki?");
    expect(client).toContain("Começar do zero");
    expect(client).toContain("Acessar meus baralhos");
    expect(client).toContain('id="anki-decks"');
    expect(client).not.toContain("markAnkiConfigured");
  });

  it("preserva o contexto da URL e só mostra a lei completa quando liberada", () => {
    expect(client).toContain("recorte_id=");
    expect(client).toContain("/contextos");
    expect(client).toContain("const hasFullLaw = contexts.some");
    expect(client).toContain("Baixar baralho");
    expect(client).toContain("Personalizar meu baralho");
  });

  it("reutiliza as configurações e os vídeos de instalação existentes", () => {
    expect(client).toContain("resolveAnkiPlatformTutorials(settings)");
    expect(client).toContain("getAnkiYoutubeEmbedUrl");
    expect(client).toContain("ANKI_PLATFORM_IDS");
    expect(client).toContain('item !== "navegador"');
  });
});
