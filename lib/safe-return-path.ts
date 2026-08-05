export const DEFAULT_AUTHENTICATED_PATH = "/dashboard";

export function safeReturnPath(value: string | null | undefined) {
  if (!value) return DEFAULT_AUTHENTICATED_PATH;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return DEFAULT_AUTHENTICATED_PATH;
  }

  try {
    const parsed = new URL(value, "https://legisflashcards.local");
    if (parsed.origin !== "https://legisflashcards.local") return DEFAULT_AUTHENTICATED_PATH;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return DEFAULT_AUTHENTICATED_PATH;
  }
}
