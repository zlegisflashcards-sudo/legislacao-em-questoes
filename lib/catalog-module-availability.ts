export const catalogModules = ["questoes", "anki", "legiscast", "materiais"] as const;

export type CatalogModule = (typeof catalogModules)[number];
export type CatalogModuleAvailability = Record<CatalogModule, boolean>;
export type CatalogModuleLawLink = { recorteId: string | null; completed: ReadonlySet<CatalogModule> };

export function unavailableCatalogModules(): CatalogModuleAvailability {
  return { questoes: false, anki: false, legiscast: false, materiais: false };
}

export function aggregateCatalogModuleAvailability(links: CatalogModuleLawLink[]): CatalogModuleAvailability {
  if (!links.length) return unavailableCatalogModules();
  return Object.fromEntries(catalogModules.map((module) => [module, links.every((link) => !link.recorteId && link.completed.has(module))])) as CatalogModuleAvailability;
}
