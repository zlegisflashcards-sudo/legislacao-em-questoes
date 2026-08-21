import { createHash } from "node:crypto";

export function stableAnkiId(value: string) {
  return (Number.parseInt(createHash("sha256").update(value).digest("hex").slice(0, 12), 16) % 2_000_000_000) + 1;
}

export function stableAnkiGuid(slug: string, questionId: string) {
  return createHash("sha256").update(`${slug}\0${questionId}`).digest("hex").slice(0, 32);
}

export function ankiApkgFileName(title: string) {
  const normalized = title.replace(/\bn[º°]\s*(\d+)\.(\d+)/gi, "$1$2").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${normalized || "Lei"}-Legis-Flashcards.apkg`;
}
