const AVISO_IA =
  "Este comentário foi elaborado com auxílio de inteligência artificial para apoiar seus estudos e pode conter imprecisões.";

/** Remove apresentações legadas que agora são responsabilidade da interface. */
export function limparApresentacao(resposta: string): string {
  let explicacao = resposta.trim();

  explicacao = explicacao
    .replace(/^claro[!.]?(?:\s+vamos\s+lá[!.:]?)?\s*/i, "")
    .replace(
      /^(?:olá[!,.]?\s*)?(?:eu\s+sou\s+o\s+legisbot|sou\s+o\s+legisbot)[.!,:;—-]*\s*/i,
      "",
    );

  const inicioAviso = explicacao.lastIndexOf(AVISO_IA);
  if (inicioAviso >= 0) {
    explicacao = explicacao.slice(0, inicioAviso).trim();
  }

  return explicacao;
}

