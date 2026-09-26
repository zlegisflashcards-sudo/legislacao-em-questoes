export const PUBLICATION_STATUSES = ["ativa", "em_breve", "inativa"] as const;

export type PublicationStatus = typeof PUBLICATION_STATUSES[number];

export function publicationStatusFromActive(active: boolean): PublicationStatus {
  return active ? "ativa" : "inativa";
}

export function publicationStatusLabel(status: PublicationStatus | null | undefined): string {
  return status === "em_breve" ? "Em breve" : status === "inativa" ? "Inativa" : "Ativa";
}

export function isPublished(status: PublicationStatus | null | undefined): boolean {
  return status === "ativa";
}

export function isVisibleInRecords(status: PublicationStatus | null | undefined): boolean {
  return status === "ativa" || status === "em_breve";
}
