import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolveAnkiPlatformTutorials } from "./anki-tutorial-settings";

const migration = readFileSync("supabase/migrations/20260808120000_create_anki_tutorial_settings.sql", "utf8");
const admin = readFileSync("components/admin/commercial-admin.tsx", "utf8");
const server = readFileSync("lib/commercial-admin-server.ts", "utf8");
const ankiPage = readFileSync("app/estudar/anki/page.tsx", "utf8");
const lawPage = readFileSync("app/estudar/lei/[slug]/page.tsx", "utf8");

describe("configuração administrativa do Anki", () => {
  it("mantém uma configuração única com as URLs de todas as plataformas", () => {
    expect(migration).toContain("create table if not exists public.configuracao_anki_tutoriais");
    for (const field of ["computador_app_url", "computador_tutorial_url", "android_app_url", "android_tutorial_url", "ios_app_url", "ios_tutorial_url", "navegador_app_url", "navegador_tutorial_url", "tutorial_questoes_url"]) expect(migration).toContain(field);
    expect(migration).toContain("check (id = 1)");
    expect(migration).toContain("admin_atualizar_configuracao_anki_tutoriais");
  });

  it("usa somente a configuração individual de cada plataforma", () => {
    const tutorials = resolveAnkiPlatformTutorials({
      computadorAppUrl: "https://example.com/app",
      computadorTutorialUrl: null,
      androidAppUrl: null,
      androidTutorialUrl: "https://youtu.be/abcdefghijk",
      iosAppUrl: null,
      iosTutorialUrl: null,
      navegadorAppUrl: null,
      navegadorTutorialUrl: null,
      tutorialQuestoesUrl: "https://youtu.be/12345678901",
    });
    expect(tutorials.computador.officialUrl).toBe("https://example.com/app");
    expect(tutorials.computador.videoUrl).toBeNull();
    expect(tutorials.android.videoUrl).toBe("https://youtu.be/abcdefghijk");
    expect(tutorials.ios.officialUrl).toBeNull();
  });

  it("expõe a seção protegida e repassa a configuração às páginas de tutorial", () => {
    expect(admin).toContain('id: "anki_tutoriais", label: "Anki e tutoriais"');
    expect(admin).toContain('name="tutorial_questoes_url"');
    for (const title of ["Aplicativos Anki", "Tutoriais do Anki", "Tutorial da página de estudo", "Vídeo de orientação para a página da lei"]) expect(admin).toContain(title);
    expect(server).toContain('from("configuracao_anki_tutoriais")');
    expect(server).toContain('admin_atualizar_configuracao_anki_tutoriais');
    expect(ankiPage).toContain("getAnkiTutorialSettings");
    expect(lawPage).toContain("getAnkiTutorialSettings");
  });
});
