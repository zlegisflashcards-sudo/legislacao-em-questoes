type PublicNameInput = { nome_publico?: unknown; nome?: unknown };

const technicalPublicName = /^estudante\d+$/i;

export function firstName(value: unknown) {
  return typeof value === "string" ? value.trim().split(/\s+/)[0] || null : null;
}

/** Keeps an explicitly chosen public name, but never exposes the generated estudante###### placeholder. */
export function publicStudentName({ nome_publico, nome }: PublicNameInput, fallback = "Jogador Legis") {
  const publicName = typeof nome_publico === "string" ? nome_publico.trim() : "";
  if (publicName && !technicalPublicName.test(publicName)) return publicName;
  return firstName(nome) ?? fallback;
}
