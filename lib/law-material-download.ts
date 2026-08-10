import type { LawStudyMaterial } from "@/lib/law-study";

export function parseMaterialId(value: string) {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function googleDriveFileId(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "drive.google.com") return null;
    const pathMatch = url.pathname.match(/^\/file\/d\/([A-Za-z0-9_-]+)(?:\/|$)/);
    const id = pathMatch?.[1] ?? url.searchParams.get("id");
    return id && /^[A-Za-z0-9_-]{10,}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

export function isDownloadableMaterialReference(provider: string | null, action: string | null, value: string | null) {
  return provider === "google_drive" && action === "baixar" && isAccessibleMaterialReference(provider, value);
}

export function isAccessibleMaterialReference(provider: string | null, value: string | null) {
  if (!value) return false;
  if (provider === "google_drive") return googleDriveFileId(value) !== null;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export function materialAccessReference(provider: string | null, action: string | null, value: string | null) {
  if (action === "baixar") return { available: isDownloadableMaterialReference(provider, action, value), directUrl: null };
  const directUrl = isAccessibleMaterialReference(provider, value) ? value : null;
  return { available: directUrl !== null, directUrl };
}

export function googleDriveDownloadUrl(value: string) {
  const id = googleDriveFileId(value);
  return id ? `https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=download&confirm=t` : null;
}

export function isAllowedGoogleDriveResponseUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "drive.google.com" || url.hostname === "drive.usercontent.google.com" || url.hostname.endsWith(".googleusercontent.com"));
  } catch {
    return false;
  }
}

export function safeDownloadFileName(title: string, type: LawStudyMaterial["type"]) {
  const base = title.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9._ -]+/g, "").trim().replace(/\s+/g, "-").slice(0, 100) || "material";
  const extension = ({ flashcards: ".apkg", pdf: ".pdf", audio: ".mp3", video: ".mp4", tutorial: ".pdf", outro: "" })[type];
  return base.toLocaleLowerCase("pt-BR").endsWith(extension) ? base : `${base}${extension}`;
}
