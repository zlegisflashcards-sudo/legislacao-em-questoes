/** Formato neutro usado por qualquer origem de importação (TXT ou APKG). */
export type ImportedQuestion = {
  line: number;
  deck: string[];
  pergunta: string;
  resposta: "Certo" | "Errado";
  justificativa: string;
  assunto: string;
  legislacao: string;
  ordem: string;
  titulo: string;
  total_artigos: string;
  slug: string;
  ultima_alteracao_legislativa: string;
};

export type ImportIssue = {
  line: number;
  message: string;
  deck?: string[];
  ordem?: string;
  pergunta?: string;
  field?: string;
  received?: string;
  expected?: string;
};
