import type { DoctrinePersistencePlan } from "./doctrine-persistence-plan";

export class DoctrineAdminError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/**
 * Porta transacional. O adaptador de produção será implementado somente após
 * a migration aprovada disponibilizar uma RPC atômica; o cliente Supabase não
 * oferece transações multi-tabela diretamente.
 */
export interface DoctrineRegistrationStore {
  runInTransaction<T>(operation: () => Promise<T>): Promise<T>;
  findContentBySlug(slug: string): Promise<{ id: number } | null>;
  createDoctrine(plan: DoctrinePersistencePlan): Promise<{ contentId: number }>;
}

export async function registerDoctrinePlan(store: DoctrineRegistrationStore, plan: DoctrinePersistencePlan) {
  if (!plan.questions.length || !plan.structures.length) {
    throw new DoctrineAdminError(422, "A prévia de doutrina não possui questões ou estruturas.");
  }
  if (new Set(plan.questions.map((question) => question.id)).size !== plan.questions.length) {
    throw new DoctrineAdminError(422, "A prévia de doutrina contém UUIDs duplicados.");
  }

  return store.runInTransaction(async () => {
    if (await store.findContentBySlug(plan.slug)) {
      throw new DoctrineAdminError(409, "Já existe conteúdo cadastrado com este slug.");
    }
    return store.createDoctrine(plan);
  });
}
