export const ADMIN_LAW_CONFERENCE_FILTERS = ["todas", "para_conferir", "conferida"] as const;
export type AdminLawConferenceFilter = (typeof ADMIN_LAW_CONFERENCE_FILTERS)[number];

export function adminLawConferenceFilter(value: string | undefined): AdminLawConferenceFilter {
  return ADMIN_LAW_CONFERENCE_FILTERS.includes(value as AdminLawConferenceFilter) ? value as AdminLawConferenceFilter : "todas";
}

export function adminLawConferenceStatus(value: AdminLawConferenceFilter) {
  return value === "conferida" ? "conferido" : value === "para_conferir" ? "para_conferir" : null;
}
