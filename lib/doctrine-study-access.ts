import "server-only";

import { authorizeLawStudy } from "./law-study-server";
import type { StudyAccessOptions } from "./study-access-policy";

/**
 * Gate de leitura de doutrina: usa a mesma identidade, aluno, publicação e
 * vínculo ativo das leis, mas jamais herda a exceção de acesso gratuito.
 * A rota de doutrina só deve ser criada depois da migration/cadastro aprovados.
 */
export const DOCTRINE_STUDY_ACCESS_OPTIONS: StudyAccessOptions = Object.freeze({
  allowFreeAccess: false,
});

export async function authorizeDoctrineStudy(request: Request, slug: string) {
  return authorizeLawStudy(request, slug, DOCTRINE_STUDY_ACCESS_OPTIONS);
}
