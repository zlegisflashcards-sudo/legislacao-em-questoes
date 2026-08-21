export type LawStudyPlatformId = "computador" | "android" | "ios" | "navegador";

export type LawStudyPlatform = {
  label: string;
  description: string;
};

export const LAW_STUDY_PLATFORMS: Record<LawStudyPlatformId, LawStudyPlatform> = {
  computador: { label: "Anki — Computador", description: "Tutorial de estudo desta lei no computador." },
  android: { label: "AnkiDroid — Android", description: "Tutorial de estudo desta lei no Android." },
  ios: { label: "AnkiMobile — iPhone", description: "Tutorial de estudo desta lei no iPhone e iPad." },
  navegador: { label: "Online — Em breve", description: "Tutorial de estudo desta lei pelo navegador." },
};

export const LAW_STUDY_PLATFORM_IDS = Object.keys(LAW_STUDY_PLATFORMS) as LawStudyPlatformId[];
export const DEFAULT_LAW_STUDY_PLATFORM: LawStudyPlatformId = "computador";

export type LawStudyMaterial = {
  id: number;
  type: "flashcards" | "video" | "pdf" | "tutorial" | "audio" | "outro";
  title: string;
  description: string | null;
  action: "abrir" | "baixar" | "assistir";
  itemCount: number | null;
  version: string | null;
  availableAt: string | null;
  accessAvailable: boolean;
  accessUrl: string | null;
};

export type LawStudyHistoryItem = {
  id: number;
  type: string;
  importance: "informativa" | "recomendada" | "essencial";
  title: string;
  summary: string | null;
  legalReference: string | null;
  version: string | null;
  publishedAt: string;
};

export type LawStudyData = {
  law: {
    id: number;
    slug: string;
    title: string;
    shortName: string | null;
    code: string | null;
    totalFlashcards: number;
  };
  materials: LawStudyMaterial[];
  history: LawStudyHistoryItem[];
  progress: { inStudy: boolean; questionsFinished: boolean };
};

export type LawStudyProgress = LawStudyData["progress"];

export function nextLawStudyProgress(current: LawStudyProgress, field: "inStudy" | "questionsFinished", checked: boolean): LawStudyProgress {
  if (field === "questionsFinished") {
    return { inStudy: checked ? true : current.inStudy, questionsFinished: checked };
  }
  return { inStudy: checked, questionsFinished: checked ? current.questionsFinished : false };
}

export function lawStudyProgressMessage(progress: LawStudyProgress) {
  if (progress.questionsFinished) {
    return "Estudo Ativo da Lei concluído! Você pode continuar revisando as questões online quando quiser.";
  }
  if (progress.inStudy) {
    return "Continue avançando nas questões desta lei até concluir o primeiro ciclo de estudo.";
  }
  return null;
}

export function lawStudyShortName(title: string, shortName: string | null) {
  const normalized = shortName?.trim();
  if (!normalized || normalized.toLocaleLowerCase("pt-BR") === title.trim().toLocaleLowerCase("pt-BR")) return null;
  return normalized;
}

export function isValidLawSlug(value: string) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

export function lawMaterialIcon(type: LawStudyMaterial["type"]) {
  return ({ flashcards: "🎮", video: "▶️", pdf: "📄", tutorial: "📘", audio: "🎧", outro: "📎" })[type];
}

export function lawMaterialActionLabel(material: Pick<LawStudyMaterial, "type" | "action">) {
  if (material.action === "assistir") return "Assistir";
  if (material.action === "baixar" && material.type === "flashcards") return "Baixar flashcards";
  if (material.action === "baixar" && material.type === "pdf") return "Baixar PDF";
  if (material.action === "baixar") return "Baixar material";
  return "Abrir material";
}

export function lawMaterialAvailabilityLabel(material: Pick<LawStudyMaterial, "accessAvailable" | "availableAt">) {
  if (material.accessAvailable) return null;
  const match = material.availableAt?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `Disponível em ${match[3]}/${match[2]}/${match[1]}` : "Em breve";
}

export function lawHistoryDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data não informada";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeZone: "America/Sao_Paulo" }).format(date);
}
