begin;

-- A conferência é uma afirmação sobre o conteúdo da questão. Sempre que uma
-- importação (ou outro editor) alterar esse conteúdo, a marcação deixa de ser
-- válida apenas para o nó afetado e para a revisão integral da lei.
create or replace function public.invalidar_conferencia_de_questao_alterada()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if old.pergunta is not distinct from new.pergunta
     and old.resposta is not distinct from new.resposta
     and old.justificativa is not distinct from new.justificativa
     and old.titulo is not distinct from new.titulo
     and old.assunto is not distinct from new.assunto
     and old.legislacao is not distinct from new.legislacao
     and old.ordem is not distinct from new.ordem
     and old.total_artigos is not distinct from new.total_artigos
     and old.ultima_alteracao_legislativa is not distinct from new.ultima_alteracao_legislativa then
    return new;
  end if;

  delete from public.admin_question_law_reviews
   where lei_id = new.lei_id;

  delete from public.admin_question_structure_reviews
   where lei_id = new.lei_id
     and structure_id in (old.structure_id, new.structure_id);

  return new;
end;
$function$;

drop trigger if exists invalidar_conferencia_de_questao_alterada on public.questions;
create trigger invalidar_conferencia_de_questao_alterada
after update of pergunta, resposta, justificativa, titulo, assunto, legislacao,
  ordem, total_artigos, ultima_alteracao_legislativa on public.questions
for each row execute function public.invalidar_conferencia_de_questao_alterada();

revoke all on function public.invalidar_conferencia_de_questao_alterada() from public, anon, authenticated;

comment on function public.invalidar_conferencia_de_questao_alterada() is
  'Remove a marcação administrativa de conferência de uma estrutura quando uma questão do nó é atualizada.';

commit;
