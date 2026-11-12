export class LegislativeReferenceStructureLinkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LegislativeReferenceStructureLinkError";
  }
}

/** Validação antecipada; a FK composta no banco repete a regra como autoridade final. */
export function assertLegislativeReferenceStructureLaw(input: {
  referenceLawId: number;
  structureLawId: number | null;
}) {
  if (!Number.isSafeInteger(input.referenceLawId) || input.referenceLawId <= 0) {
    throw new LegislativeReferenceStructureLinkError("Referência legislativa inválida.");
  }
  if (input.structureLawId !== null && (!Number.isSafeInteger(input.structureLawId) || input.structureLawId <= 0)) {
    throw new LegislativeReferenceStructureLinkError("Estrutura legislativa inválida.");
  }
  if (input.structureLawId !== null && input.structureLawId !== input.referenceLawId) {
    throw new LegislativeReferenceStructureLinkError("A estrutura selecionada pertence a outra lei.");
  }
}
