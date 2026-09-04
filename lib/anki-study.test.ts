import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ANKI_PLATFORM_IDS,
  ANKI_PLATFORM_TUTORIALS,
  DEFAULT_ANKI_PLATFORM,
  ankiSetupStorageKey,
  clearAnkiConfigured,
  getAnkiYoutubeEmbedUrl,
  markAnkiConfigured,
  readAnkiConfigured,
  shouldPromptBeforeLawStudy,
} from "./anki-study";

const page = readFileSync("app/estudar/anki/page.tsx", "utf8");
const client = readFileSync("components/anki-study-page-client.tsx", "utf8");
const tabs = readFileSync("components/student-area-tabs.tsx", "utf8");

function memoryStorage(initial?: Record<string, string>) {
  const values = new Map(Object.entries(initial ?? {}));
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

describe("configuração dos tutoriais do Anki", () => {
  it("mantém quatro plataformas tipadas, Computador como padrão e sem URLs padrão", () => {
    expect(ANKI_PLATFORM_IDS).toEqual(["computador", "android", "ios", "navegador"]);
    expect(DEFAULT_ANKI_PLATFORM).toBe("computador");
    expect(Object.values(ANKI_PLATFORM_TUTORIALS).map((item) => item.label)).toEqual(["Anki — Computador", "AnkiDroid — Android", "AnkiMobile — iPhone", "Online — Em breve"]);
    expect(Object.values(ANKI_PLATFORM_TUTORIALS).every((item) => item.videoUrl === null && item.officialUrl === null)).toBe(true);
  });

  it("mantém apenas os textos de cada plataforma", () => {
    expect(ANKI_PLATFORM_TUTORIALS.computador).toMatchObject({ description: "Windows, Mac e Linux", buttonLabel: "Baixar o Anki", note: "Gratuito" });
    expect(ANKI_PLATFORM_TUTORIALS.android).toMatchObject({ description: "AnkiDroid", buttonLabel: "Baixar na Google Play", note: "Gratuito" });
    expect(ANKI_PLATFORM_TUTORIALS.ios).toMatchObject({ description: "iPhone e iPad", buttonLabel: "Baixar na App Store", note: "Aplicativo pago mantido pelo desenvolvedor principal" });
    expect(ANKI_PLATFORM_TUTORIALS.navegador).toMatchObject({ description: "No site", buttonLabel: "Acessar o AnkiWeb", note: "" });
  });

  it("aceita somente URLs HTTPS conhecidas do YouTube com ID válido", () => {
    expect(getAnkiYoutubeEmbedUrl("https://www.youtube.com/watch?v=abcdefghijk")).toBe("https://www.youtube-nocookie.com/embed/abcdefghijk");
    expect(getAnkiYoutubeEmbedUrl("https://youtu.be/abcdefghijk")).toBe("https://www.youtube-nocookie.com/embed/abcdefghijk");
    expect(getAnkiYoutubeEmbedUrl("https://www.youtube.com/embed/abcdefghijk")).toBe("https://www.youtube-nocookie.com/embed/abcdefghijk");
    for (const invalid of [null, "", "javascript:alert(1)", "http://youtu.be/abcdefghijk", "https://example.com/abcdefghijk", "https://youtu.be/curto"]) {
      expect(getAnkiYoutubeEmbedUrl(invalid)).toBeNull();
    }
  });
});

describe("estado local do Anki", () => {
  const userId = "usuario-a";
  const otherUserId = "usuario-b";

  it("diferencia usuários e reconhece somente o literal true", () => {
    const storage = memoryStorage();
    expect(ankiSetupStorageKey(userId)).not.toBe(ankiSetupStorageKey(otherUserId));
    expect(readAnkiConfigured(storage, userId)).toBe(false);
    storage.setItem(ankiSetupStorageKey(userId), "TRUE");
    expect(readAnkiConfigured(storage, userId)).toBe(false);
    expect(markAnkiConfigured(storage, userId)).toBe(true);
    expect(storage.values.get(ankiSetupStorageKey(userId))).toBe("true");
    expect(readAnkiConfigured(storage, userId)).toBe(true);
    expect(readAnkiConfigured(storage, otherUserId)).toBe(false);
  });

  it("remove somente a chave do usuário atual", () => {
    const storage = memoryStorage({
      [ankiSetupStorageKey(userId)]: "true",
      [ankiSetupStorageKey(otherUserId)]: "true",
      outro: "preservado",
    });
    expect(clearAnkiConfigured(storage, userId)).toBe(true);
    expect(storage.values.has(ankiSetupStorageKey(userId))).toBe(false);
    expect(storage.values.get(ankiSetupStorageKey(otherUserId))).toBe("true");
    expect(storage.values.get("outro")).toBe("preservado");
  });

  it("volta com segurança a pendente quando o armazenamento falha", () => {
    const failingStorage = {
      getItem: () => { throw new Error("indisponível"); },
      setItem: () => { throw new Error("indisponível"); },
      removeItem: () => { throw new Error("indisponível"); },
    };
    expect(readAnkiConfigured(failingStorage, userId)).toBe(false);
    expect(markAnkiConfigured(failingStorage, userId)).toBe(false);
    expect(clearAnkiConfigured(failingStorage, userId)).toBe(false);
  });

  it("solicita configuração antes da lei somente enquanto o Anki estiver pendente", () => {
    expect(shouldPromptBeforeLawStudy(false)).toBe(true);
    expect(shouldPromptBeforeLawStudy(true)).toBe(false);
  });
});

describe("página autenticada do Anki", () => {
  it("cria a rota cliente protegida com retorno seguro e sem exigir lei liberada", () => {
    expect(page).toContain("getAnkiTutorialSettings");
    expect(page).toContain("<AnkiStudyPageClient settings={settings} />");
    expect(client).toContain("supabase.auth.getSession()");
    expect(client).toContain('/conta?modo=login&retorno=%2Festudar%2Fanki');
    expect(client).toContain("window.location.replace(LOGIN_URL)");
    for (const forbidden of ["public.leis", "liberacoes_leis", "lei_id", "service_role", "/api/"]) expect(client.toLowerCase()).not.toContain(forbidden);
  });

  it("reutiliza as abas sem botão Voltar e direciona para Meu edital", () => {
    expect(client).toContain('<StudentAreaTabs activeTab="leis" minhasLeisHref="/minhas-leis" />');
    expect(tabs).toContain("Legis Questões");
    expect(tabs).toContain("Meu edital");
    expect(tabs).toContain('href="/meu-edital"');
    expect(client).not.toContain("Voltar");
  });

  it("exibe cabeçalho, plataformas e instruções acessíveis", () => {
    for (const expected of ["/icons/anki.png", "Material complementar", "Estudar no Anki", "Nesta mini aula, vamos apenas baixar e instalar o aplicativo. Na próxima aula, você vai baixar as questões.", "Não sabe qual escolher?", "Ver qual opção é ideal para mim", "Celular ou tablet:", "Navegador:", "aguarde novidades."]) expect(client).toContain(expected);
    expect(client).not.toContain("Neste tutorial, você aprenderá a:");
    for (const expected of ["Agora que você instalou e configurou o Anki:", "Sua conta está pronta;", "A sincronização está configurada;", "O aplicativo está preparado para receber seus materiais.", "Próximo passo: acesse Legis Questões para escolher uma legislação e começar a estudar."]) expect(client).toContain(expected);
    expect(client).not.toContain("Ir para Legis Questões");
    expect(client).not.toContain("Passo obrigatório");
    expect(client).toContain("aria-pressed={selected}");
    expect(client).toContain("grid-cols-2");
    expect(client).toContain("sm:grid-cols-4");
    expect(client).toContain("aspect-video");
    expect(client).toContain("key={activePlatform}");
    expect(client).toContain("{tutorial.officialUrl ? <a href={tutorial.officialUrl}");
    expect(client).not.toContain("generalTutorialEmbedUrl");
    expect(client).not.toContain("Tutorial geral de questões");
    expect(client).toContain("{tutorial.description}");
    expect(client).toContain("{tutorial.note}");
    expect(client).toContain("{tutorial.buttonLabel}");
    expect(client).toContain('target="_blank"');
    expect(client).toContain('rel="noopener noreferrer"');
    expect(client).not.toContain("dangerouslySetInnerHTML");
    expect(client).not.toContain("autoplay");
  });

  it("não exibe status de conclusão do Anki, sem API ou navegação", () => {
    expect(client).toContain(">Verificando</strong>");
    expect(client).not.toContain('type="checkbox"');
    expect(client).not.toContain("Marcar como concluído");
    expect(client).not.toContain("anki-status-title");
    expect(client).not.toContain("Progresso da aula");
    expect(client).not.toContain("Concluir esta aula");
    for (const forbidden of ["fetch(", ".rpc(", "setProgress", "updateProgress", "window.location.href"] ) expect(client).not.toContain(forbidden);
  });

  it("não acessa localStorage durante a renderização do servidor", () => {
    expect(client).not.toContain("window.localStorage");
    expect(page).not.toContain("localStorage");
  });
});
