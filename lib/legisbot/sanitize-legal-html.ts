import "server-only";
import { hasLegalTextCore, sanitizeLegalHtmlCore } from "./sanitize-legal-html-core";

export function sanitizarHtmlLegislacao(html: string): string {
  return sanitizeLegalHtmlCore(html);
}

export function possuiTextoLegislacao(htmlSanitizado: string): boolean {
  return hasLegalTextCore(htmlSanitizado);
}
