export const DEFAULT_AUTHENTICATED_PATH = "/minhas-leis";

export function safeReturnPath(value: string | null | undefined) {
  if (!value) return DEFAULT_AUTHENTICATED_PATH;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return DEFAULT_AUTHENTICATED_PATH;
  }

  try {
    const parsed = new URL(value, "https://legisflashcards.local");
    if (parsed.origin !== "https://legisflashcards.local") return DEFAULT_AUTHENTICATED_PATH;
    if (parsed.pathname === "/conta" || parsed.pathname === "/conta/") return DEFAULT_AUTHENTICATED_PATH;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return DEFAULT_AUTHENTICATED_PATH;
  }
}

export function accountStepPath(step: "primeiro-acesso" | "recuperar", returnPath: string | null | undefined) {
  const params = new URLSearchParams({ [step]: "1", retorno: safeReturnPath(returnPath) });
  return `/conta?${params.toString()}`;
}
