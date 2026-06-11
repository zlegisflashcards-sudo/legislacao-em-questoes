import { supabase } from "@/lib/supabase";

export type ProdutoV2 = {
  id: string;
  nome: string;
  tipo: string;
  hotmart_product_id: string;
  slug_opcional: string | null;
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
};

export type NovoProdutoV2 = {
  nome: string;
  tipo: string;
  hotmart_product_id: string;
  ativo: boolean;
};

export type AtualizacaoProdutoV2 = {
  nome?: string;
  tipo?: string;
  ativo?: boolean;
};

export type HotmartEvento = {
  id: string;
  hotmart_event_id: string | null;
  evento: string;
  hotmart_product_id: string | null;
  hotmart_transaction_id: string | null;
  payload: Record<string, unknown>;
  processado: boolean;
  erro_processamento: string | null;
  criado_em: string;
};

export type Compra = {
  id: string;
  aluno_id: string;
  produto_id: string;
  hotmart_product_id: string;
  hotmart_transaction_id: string | null;
  hotmart_evento_id: string | null;
  status:
    | "aprovada"
    | "pendente"
    | "cancelada"
    | "reembolsada"
    | "chargeback"
    | "manual";
  valor_centavos: number | null;
  moeda: string | null;
  comprada_em: string | null;
  criado_em: string;
  atualizado_em: string;
};

export type AlunoProduto = {
  id: string;
  aluno_id: string;
  produto_id: string;
  compra_id: string | null;
  ativo: boolean;
  origem: "compra" | "importacao" | "manual";
  adquirido_em: string | null;
  criado_em: string;
  atualizado_em: string;
  produtos?: ProdutoV2 | null;
};

export async function buscarProdutosAtivosV2() {
  const { data, error } = await supabase
    .from("produtos")
    .select("*")
    .eq("ativo", true)
    .order("nome", { ascending: true })
    .returns<ProdutoV2[]>();

  if (error) {
    throw error;
  }

  return data;
}

export async function listarProdutosV2() {
  const { data, error } = await supabase
    .from("produtos")
    .select("*")
    .order("criado_em", { ascending: false })
    .returns<ProdutoV2[]>();

  if (error) {
    throw error;
  }

  return data;
}

export async function cadastrarProdutoV2(produto: NovoProdutoV2) {
  const { data, error } = await supabase
    .from("produtos")
    .insert(produto)
    .select("*")
    .single<ProdutoV2>();

  if (error) {
    throw error;
  }

  return data;
}

export async function atualizarProdutoV2(
  produtoId: string,
  atualizacao: AtualizacaoProdutoV2
) {
  const { data, error } = await supabase
    .from("produtos")
    .update(atualizacao)
    .eq("id", produtoId)
    .select("*")
    .single<ProdutoV2>();

  if (error) {
    throw error;
  }

  return data;
}

export async function buscarComprasDoAluno(alunoId: string) {
  const { data, error } = await supabase
    .from("compras")
    .select("*")
    .eq("aluno_id", alunoId)
    .order("criado_em", { ascending: false })
    .returns<Compra[]>();

  if (error) {
    throw error;
  }

  return data;
}

export async function buscarProdutosDoAluno(alunoId: string) {
  const { data, error } = await supabase
    .from("aluno_produtos")
    .select("*, produtos(*)")
    .eq("aluno_id", alunoId)
    .eq("ativo", true)
    .order("criado_em", { ascending: false })
    .returns<AlunoProduto[]>();

  if (error) {
    throw error;
  }

  return data;
}
