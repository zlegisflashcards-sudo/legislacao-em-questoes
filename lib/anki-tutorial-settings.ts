import {
  ANKI_PLATFORM_IDS,
  ANKI_PLATFORM_TUTORIALS,
  type AnkiPlatformId,
  type AnkiPlatformTutorial,
} from "./anki-study";

export type AnkiTutorialSettings = {
  computadorAppUrl: string | null;
  computadorTutorialUrl: string | null;
  androidAppUrl: string | null;
  androidTutorialUrl: string | null;
  iosAppUrl: string | null;
  iosTutorialUrl: string | null;
  navegadorAppUrl: string | null;
  navegadorTutorialUrl: string | null;
  tutorialQuestoesUrl: string | null;
  computadorEstudoUrl: string | null;
  androidEstudoUrl: string | null;
  iosEstudoUrl: string | null;
  navegadorEstudoUrl: string | null;
};

const PLATFORM_FIELDS: Record<AnkiPlatformId, { app: keyof AnkiTutorialSettings; tutorial: keyof AnkiTutorialSettings }> = {
  computador: { app: "computadorAppUrl", tutorial: "computadorTutorialUrl" },
  android: { app: "androidAppUrl", tutorial: "androidTutorialUrl" },
  ios: { app: "iosAppUrl", tutorial: "iosTutorialUrl" },
  navegador: { app: "navegadorAppUrl", tutorial: "navegadorTutorialUrl" },
};

const LAW_STUDY_FIELDS: Record<AnkiPlatformId, keyof AnkiTutorialSettings> = {
  computador: "computadorEstudoUrl",
  android: "androidEstudoUrl",
  ios: "iosEstudoUrl",
  navegador: "navegadorEstudoUrl",
};

function configuredUrl(value: string | null | undefined) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function resolveAnkiPlatformTutorials(settings: AnkiTutorialSettings | null | undefined): Record<AnkiPlatformId, AnkiPlatformTutorial> {
  return Object.fromEntries(ANKI_PLATFORM_IDS.map((platform) => {
    const fallback = ANKI_PLATFORM_TUTORIALS[platform];
    const fields = PLATFORM_FIELDS[platform];
    const appUrl = configuredUrl(settings?.[fields.app]);
    const tutorialUrl = configuredUrl(settings?.[fields.tutorial]);
    return [platform, { ...fallback, officialUrl: appUrl, videoUrl: tutorialUrl }];
  })) as Record<AnkiPlatformId, AnkiPlatformTutorial>;
}

export function resolveLawStudyPlatformTutorials(settings: AnkiTutorialSettings | null | undefined): Record<AnkiPlatformId, string | null> {
  return Object.fromEntries(ANKI_PLATFORM_IDS.map((platform) => [platform, configuredUrl(settings?.[LAW_STUDY_FIELDS[platform]])])) as Record<AnkiPlatformId, string | null>;
}
