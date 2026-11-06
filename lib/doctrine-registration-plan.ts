import {
  doctrineRowsFromTransfer,
  previewDoctrineImport,
  type DoctrineTransferPayload,
} from "./doctrine-import-contract";

export const DRAFT_DOCTRINE_SLUG = "direito-administrativo";

export type DoctrineRegistrationPlan = {
  slug: string;
  titulo: string;
  tipoConteudo: "doutrina";
  questions: number;
  topics: number;
  structures: string[];
  orders: string[];
  errors: string[];
};

/**
 * Prévia local de cadastro. Não escreve no banco nem consulta produção.
 * A confirmação de colisão do slug e o acesso da disciplina ficam para a
 * etapa de produção, após a migration revisada.
 */
export function planDoctrineRegistration(payload: DoctrineTransferPayload, slug = DRAFT_DOCTRINE_SLUG): DoctrineRegistrationPlan {
  const preview = previewDoctrineImport(doctrineRowsFromTransfer(payload));
  const structures = [...new Set(preview.rows.map((row) => row.deck.slice(1).join("::")).filter(Boolean))].sort();
  return {
    slug,
    titulo: preview.rows[0]?.titulo.trim() || "Direito Administrativo",
    tipoConteudo: "doutrina",
    questions: preview.rows.length,
    topics: preview.topicCount,
    structures,
    orders: preview.orders,
    errors: preview.issues.map((issue) => `linha ${issue.row + 1}: ${issue.message}`),
  };
}
