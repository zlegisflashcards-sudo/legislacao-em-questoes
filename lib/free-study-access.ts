import { safeReturnPath } from "@/lib/safe-return-path";

/**
 * Keeps the destination of a free-study CTA inside the application while the
 * visitor identifies themself.  This is deliberately independent of pricing:
 * callers only use it after the official law access flag was resolved.
 */
export function freeStudyLoginHref(studyHref: string) {
  const params = new URLSearchParams({
    modo: "login",
    gratis: "1",
    retorno: safeReturnPath(studyHref),
  });
  return `/conta?${params.toString()}`;
}
