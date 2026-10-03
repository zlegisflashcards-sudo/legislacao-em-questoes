type DispositivoComReferencia = {
  assunto: string;
  slug: string;
};

/** Referência curta usada na lista pública, sem expor o estado do comentário. */
export function getReferenciaDispositivo({ assunto, slug }: DispositivoComReferencia) {
  const dispositivo = assunto.trim();
  const lei = slug.trim().toUpperCase();
  return dispositivo && lei ? `${dispositivo}, ${lei}` : dispositivo || lei || "Dispositivo legal";
}
