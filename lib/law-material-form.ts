export function lawMaterialFormData(values: { titulo: string; url_externa: string }, lawId: number, editing: boolean) {
  if (editing) return values;

  let provider = "externo";
  try {
    if (new URL(values.url_externa).hostname.toLowerCase() === "drive.google.com") provider = "google_drive";
  } catch {
    // A URL continua opcional; a validação do formulário trata URLs inválidas.
  }
  return { ...values, lei_id: lawId, tipo: "pdf", provedor: provider, acao: "abrir", ordem: 0, ativo: true };
}
