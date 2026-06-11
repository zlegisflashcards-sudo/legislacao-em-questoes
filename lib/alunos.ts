import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export type Aluno = {
  id: string;
  user_id: string;
  nome: string | null;
  email: string;
  telefone: string | null;
  cpf: string | null;
  criado_em: string;
  atualizado_em: string;
};

export async function buscarOuCriarAluno(user: User) {
  const email = user.email ?? "";
  const nome =
    typeof user.user_metadata?.nome === "string"
      ? user.user_metadata.nome
      : null;

  const { data: alunoExistente, error: buscaErro } = await supabase
    .from("alunos")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle<Aluno>();

  if (buscaErro) {
    throw buscaErro;
  }

  if (alunoExistente) {
    return alunoExistente;
  }

  const { data: alunoCriado, error: criacaoErro } = await supabase
    .from("alunos")
    .insert({
      user_id: user.id,
      nome,
      email,
    })
    .select("*")
    .single<Aluno>();

  if (criacaoErro) {
    throw criacaoErro;
  }

  return alunoCriado;
}
