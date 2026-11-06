import type { DoctrinePersistencePlan } from "@/lib/doctrine-persistence-plan";

type RpcResult = { data: unknown; error: { message: string; code?: string } | null };

/**
 * Minimal port for the post-migration RPC. It is imported only by the
 * server Route Handler; keeping this module framework-neutral enables mocked
 * contract tests without shipping credentials or a client-side adapter.
 */
export type DoctrineRpcClient = {
  rpc(name: "admin_importar_doutrina", args: {
    p_ator_user_id: string;
    p_slug: string;
    p_titulo: string;
    p_ordem: number;
    p_estruturas: DoctrinePersistencePlan["structures"];
    p_questoes: DoctrinePersistencePlan["questions"];
  }): PromiseLike<RpcResult>;
};

export class DoctrineRpcImportError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

/**
 * The actor is supplied by a verified server-side admin session, never by the
 * browser payload. The database RPC remains the single transaction boundary.
 */
export async function importDoctrineViaRpc(
  client: DoctrineRpcClient,
  input: { administratorUserId: string; ordem: number; plan: DoctrinePersistencePlan },
) {
  if (!input.administratorUserId) throw new DoctrineRpcImportError(401, "Sessão administrativa inválida.");
  if (!Number.isInteger(input.ordem) || input.ordem < 0) throw new DoctrineRpcImportError(422, "Ordem de cadastro inválida.");
  const { data, error } = await client.rpc("admin_importar_doutrina", {
    p_ator_user_id: input.administratorUserId,
    p_slug: input.plan.slug,
    p_titulo: input.plan.titulo,
    p_ordem: input.ordem,
    p_estruturas: input.plan.structures,
    p_questoes: input.plan.questions,
  });
  if (error) {
    const status = error.code === "23505" ? 409 : error.code === "22023" ? 422 : 503;
    throw new DoctrineRpcImportError(status, status === 503 ? "Importação indisponível: a migration transacional ainda não está ativa." : error.message);
  }
  return data;
}
