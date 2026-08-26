begin;

create or replace function public.obter_destinatarios_aviso_lei(p_lei_id bigint)
returns table(aluno_id uuid)
language sql stable security definer set search_path=pg_catalog as $$
  select distinct liberacao.aluno_id
  from public.liberacoes_leis liberacao
  join public.alunos aluno on aluno.id = liberacao.aluno_id
  join public.leis lei on lei.id = liberacao.lei_id and lei.ativo = true
  where liberacao.lei_id = p_lei_id
    and liberacao.status = 'ativo'
    and aluno.user_id is not null
$$;

commit;
