import {
  doctrineRowsFromTransfer,
  previewDoctrineImport,
  type DoctrineTransferPayload,
} from "./doctrine-import-contract";
import { DRAFT_DOCTRINE_SLUG } from "./doctrine-registration-plan";

/**
 * Dados de escrita a serem consumidos futuramente por um serviço administrativo.
 * Este módulo não chama Supabase, não executa SQL e não infere campos legislativos.
 */
export type DoctrineStructureDraft = {
  key: string;
  nome: string;
  ordem: number;
  tipo: "estrutura";
};

export type DoctrineQuestionDraft = {
  id: string;
  assunto: string;
  ordem: string;
  pergunta: string;
  resposta: string;
  justificativa: string;
  resumo: string | null;
  totalTopicos: number;
  fonteReferencia: string | null;
  versaoFonte: string | null;
  structureKey: string;
  /** Deliberadamente nulos: doutrina não ganha artigo/lei fictícios. */
  legislacao: null;
  artigo: null;
  totalArtigos: null;
};

export type DoctrinePersistencePlan = {
  slug: string;
  titulo: string;
  tipoConteudo: "doutrina";
  structures: DoctrineStructureDraft[];
  questions: DoctrineQuestionDraft[];
};

const optional = (value: string) => value.trim() || null;

/**
 * Materializa somente uma prévia de persistência a partir do contrato validado.
 * A integração futura deve testar colisão de slug/UUID e fazer uma transação com
 * a migration aprovada antes de gravar qualquer registro de produção.
 */
export function buildDoctrinePersistencePlan(
  payload: DoctrineTransferPayload,
  slug = DRAFT_DOCTRINE_SLUG,
): DoctrinePersistencePlan {
  const rows = doctrineRowsFromTransfer(payload);
  const preview = previewDoctrineImport(rows);
  if (preview.issues.length) {
    throw new Error(`Prévia de doutrina inválida: ${preview.issues[0].message}`);
  }

  const structureKeys = new Map<string, string>();
  const structures: DoctrineStructureDraft[] = [];
  for (const row of rows) {
    const name = (row.deck.slice(1).join("::") || row.estrutura).trim();
    if (!structureKeys.has(name)) {
      const key = `structure-${structures.length + 1}`;
      structureKeys.set(name, key);
      structures.push({ key, nome: name, ordem: structures.length + 1, tipo: "estrutura" });
    }
  }

  return {
    slug,
    titulo: rows[0]?.titulo.trim() || "Direito Administrativo",
    tipoConteudo: "doutrina",
    structures,
    questions: rows.map((row) => {
      const structureName = (row.deck.slice(1).join("::") || row.estrutura).trim();
      return {
        id: row.IDQuestao.trim(),
        assunto: row.assunto.trim(),
        ordem: row.ordem.trim(),
        pergunta: row.pergunta,
        resposta: row.resposta.trim(),
        justificativa: row.justificativa,
        resumo: optional(row.resumo),
        totalTopicos: Number(row.totalAssuntos),
        fonteReferencia: optional(row.referencia),
        versaoFonte: optional(row.versao),
        structureKey: structureKeys.get(structureName)!,
        legislacao: null,
        artigo: null,
        totalArtigos: null,
      };
    }),
  };
}
