import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolveAnkiPlatformTutorials, resolveLawStudyPlatformTutorials } from "./anki-tutorial-settings";

const migration = readFileSync("supabase/migrations/20260808120000_create_anki_tutorial_settings.sql", "utf8");
const lawStudyMigration = readFileSync("supabase/migrations/20260808130000_add_law_study_platform_tutorial_urls.sql", "utf8");
const admin = readFileSync("components/admin/commercial-admin.tsx", "utf8");
const server = readFileSync("lib/commercial-admin-server.ts", "utf8");
const supabaseServer = readFileSync("lib/supabase-server.ts", "utf8");
const ankiPage = readFileSync("app/estudar/anki/page.tsx", "utf8");
const lawPage = readFileSync("app/estudar/lei/[slug]/page.tsx", "utf8");

describe("configuração administrativa do Anki", () => {
  it("mantém uma configuração única com as URLs de todas as plataformas", () => {
    expect(migration).toContain("create table if not exists public.configuracao_anki_tutoriais");
    for (const field of ["computador_app_url", "computador_tutorial_url", "android_app_url", "android_tutorial_url", "ios_app_url", "ios_tutorial_url", "navegador_app_url", "navegador_tutorial_url", "tutorial_questoes_url"]) expect(migration).toContain(field);
    for (const field of ["computador_estudo_url", "android_estudo_url", "ios_estudo_url", "navegador_estudo_url"]) expect(lawStudyMigration).toContain(field);
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
      computadorEstudoUrl: "https://youtu.be/abcdefghijk",
      androidEstudoUrl: null,
      iosEstudoUrl: "https://youtu.be/zyxwvutsrqp",
      navegadorEstudoUrl: null,
    });
    expect(tutorials.computador.officialUrl).toBe("https://example.com/app");
    expect(tutorials.computador.videoUrl).toBeNull();
    expect(tutorials.android.videoUrl).toBe("https://youtu.be/abcdefghijk");
    expect(tutorials.ios.officialUrl).toBeNull();
    const lawStudyTutorials = resolveLawStudyPlatformTutorials({
      computadorAppUrl: null,
      computadorTutorialUrl: null,
      androidAppUrl: null,
      androidTutorialUrl: null,
      iosAppUrl: null,
      iosTutorialUrl: null,
      navegadorAppUrl: null,
      navegadorTutorialUrl: null,
      tutorialQuestoesUrl: "https://youtu.be/12345678901",
      computadorEstudoUrl: "https://youtu.be/abcdefghijk",
      androidEstudoUrl: null,
      iosEstudoUrl: "https://youtu.be/zyxwvutsrqp",
      navegadorEstudoUrl: null,
    });
    expect(lawStudyTutorials.computador).toBe("https://youtu.be/abcdefghijk");
    expect(lawStudyTutorials.android).toBeNull();
    expect(lawStudyTutorials.ios).toBe("https://youtu.be/zyxwvutsrqp");
  });

  it("expõe a seção protegida e repassa a configuração às páginas de tutorial", () => {
    expect(admin).toContain('id: "anki_tutoriais", label: "Anki e tutoriais"');
    for (const field of ["computador_estudo_url", "android_estudo_url", "ios_estudo_url", "navegador_estudo_url"]) expect(admin).toContain(`name="${field}"`);
    for (const title of ["Aplicativos Anki", "Tutoriais do Anki", "Tutorial da página de estudo", "Computador — vídeo de orientação"]) expect(admin).toContain(title);
    expect(server).toContain('from("configuracao_anki_tutoriais")');
    expect(server).toContain('admin_atualizar_configuracao_anki_tutoriais');
    expect(supabaseServer).toContain('cache: "no-store"');
    expect(ankiPage).toContain("getAnkiTutorialSettings");
    expect(lawPage).toContain("getAnkiTutorialSettings");
  });
});
