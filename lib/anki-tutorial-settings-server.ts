import "server-only";

import type { AnkiTutorialSettings } from "@/lib/anki-tutorial-settings";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export async function getAnkiTutorialSettings(): Promise<AnkiTutorialSettings | null> {
  try {
    const { data, error } = await getSupabaseServerClient()
      .from("configuracao_anki_tutoriais")
      .select("computador_app_url,computador_tutorial_url,android_app_url,android_tutorial_url,ios_app_url,ios_tutorial_url,navegador_app_url,navegador_tutorial_url,tutorial_questoes_url")
      .eq("id", 1)
      .maybeSingle();
    if (error || !data) return null;
    return {
      computadorAppUrl: data.computador_app_url,
      computadorTutorialUrl: data.computador_tutorial_url,
      androidAppUrl: data.android_app_url,
      androidTutorialUrl: data.android_tutorial_url,
      iosAppUrl: data.ios_app_url,
      iosTutorialUrl: data.ios_tutorial_url,
      navegadorAppUrl: data.navegador_app_url,
      navegadorTutorialUrl: data.navegador_tutorial_url,
      tutorialQuestoesUrl: data.tutorial_questoes_url,
    };
  } catch {
    return null;
  }
}
