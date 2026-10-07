type DispositivoComReferencia = {
  assunto: string;
  slug: string;
};

/** Referência curta usada na lista pública, sem repetir o código interno da lei. */
export function getReferenciaDispositivo({ assunto, slug }: DispositivoComReferencia) {
  const dispositivo = assunto.replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim();
  return dispositivo || slug.trim().toUpperCase() || "Dispositivo legal";
}
