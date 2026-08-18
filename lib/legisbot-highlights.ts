import { legalHtmlToPlainText, normalizeCommunityIdentifiers } from "./legisbot-community";

export const HIGHLIGHT_COLORS = ["amarelo", "rosa"] as const;
export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number];

export type LegisBotHighlight = {
  id: string;
  start: number;
  end: number;
  text: string;
  color: HighlightColor;
  createdAt: string;
  updatedAt: string;
};

export type HighlightSelection = {
  start: number;
  end: number;
  text: string;
};

export function normalizeHighlightIdentifiers(slug: string, ordem: string) {
  return normalizeCommunityIdentifiers(slug, ordem);
}

export function isHighlightColor(value: unknown): value is HighlightColor {
  return typeof value === "string" && HIGHLIGHT_COLORS.includes(value as HighlightColor);
}

export function normalizeLegalText(value: string) {
  return legalHtmlToPlainText(value);
}

export function validateHighlightSelection(
  legislationText: string,
  startValue: unknown,
  endValue: unknown,
  submittedText: unknown,
) {
  const start = Number(startValue);
  const end = Number(endValue);
  const text = typeof submittedText === "string" ? submittedText : "";

  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > legislationText.length) {
    return { ok: false as const, message: "A seleção do destaque é inválida." };
  }

  const literalText = legislationText.slice(start, end);
  if (!literalText.trim() || literalText !== text) {
    return { ok: false as const, message: "O trecho selecionado não corresponde à legislação atual." };
  }

  return { ok: true as const, selection: { start, end, text: literalText } };
}

export function rangesOverlap(firstStart: number, firstEnd: number, secondStart: number, secondEnd: number) {
  return firstStart < secondEnd && secondStart < firstEnd;
}

export function isHighlightCompatible(highlight: LegisBotHighlight, legislationText: string) {
  return highlight.start >= 0
    && highlight.end > highlight.start
    && highlight.end <= legislationText.length
    && legislationText.slice(highlight.start, highlight.end) === highlight.text;
}
