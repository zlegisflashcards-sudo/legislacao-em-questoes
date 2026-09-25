/** Produtos que representam uma composição viva de leis para fins acadêmicos e de acesso. */
export function isCompositeLawProduct(type: unknown) {
  return type === "edital" || type === "combo";
}
