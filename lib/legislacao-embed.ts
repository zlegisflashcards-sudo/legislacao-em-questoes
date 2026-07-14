export function getLegislacaoEmbedUrl(url: string | null | undefined): string {
  const trimmedUrl = url?.trim() ?? "";

  if (!trimmedUrl) return "";

  try {
    const parsedUrl = new URL(trimmedUrl);
    const driveFileMatch = parsedUrl.pathname.match(/^\/file\/d\/([^/?]+)/);

    if (parsedUrl.hostname === "drive.google.com" && driveFileMatch?.[1]) {
      return `https://drive.google.com/file/d/${driveFileMatch[1]}/preview`;
    }
  } catch {
    // Mantém URLs inesperadas como eram tratadas antes desta normalização.
  }

  return trimmedUrl;
}

export function isLegislacaoUrlValida(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.protocol === "https:" || parsedUrl.protocol === "http:";
  } catch {
    return false;
  }
}
