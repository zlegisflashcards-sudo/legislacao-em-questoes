export const catalogModules = ["questoes", "anki", "legiscast", "materiais"] as const;

export type CatalogModule = (typeof catalogModules)[number];
export type CatalogModuleAvailability = Record<CatalogModule, boolean>;
export type CatalogModuleLawLink = { completed: ReadonlySet<CatalogModule> };

export function unavailableCatalogModules(): CatalogModuleAvailability {
  return { questoes: false, anki: false, legiscast: false, materiais: false };
}

/**
 * Recortes orientam o conteúdo estudado, mas não representam um módulo novo.
 * A vitrine avalia cada ferramenta pela disponibilidade na lei de origem.
 */
export function aggregateCatalogModuleAvailability(links: CatalogModuleLawLink[]): CatalogModuleAvailability {
  if (!links.length) return unavailableCatalogModules();
  return Object.fromEntries(catalogModules.map((module) => [module, links.every((link) => link.completed.has(module))])) as CatalogModuleAvailability;
}
