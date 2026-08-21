begin;

create index if not exists campanhas_leis_alunos_ranking_idx
  on public.campanhas_leis_alunos (lei_id, aluno_id, score desc, concluida_em asc, id asc)
  where concluida;

create or replace function public.obter_resultado_campanha_lei(p_aluno_id uuid, p_lei_id bigint)
returns table(score_atual integer, melhor_score integer, melhor_score_em timestamptz, posicao bigint, participantes bigint)
language sql security definer set search_path = public as $$
  with melhores as (
    select aluno_id, lei_id, max(score) as melhor_score
    from campanhas_leis_alunos
    where lei_id = p_lei_id and concluida = true
    group by aluno_id, lei_id
  ), classificados as (
    select m.aluno_id, m.melhor_score,
      min(c.concluida_em) filter (where c.score = m.melhor_score) as melhor_score_em
    from melhores m
    join campanhas_leis_alunos c on c.aluno_id = m.aluno_id and c.lei_id = m.lei_id and c.concluida = true
    group by m.aluno_id, m.melhor_score
  ), ordenados as (
    select *, row_number() over (order by melhor_score desc, melhor_score_em asc, aluno_id asc) as posicao,
      count(*) over () as participantes
    from classificados
  )
  select c.score, o.melhor_score, o.melhor_score_em, o.posicao, o.participantes
  from campanhas_leis_alunos c join ordenados o on o.aluno_id = c.aluno_id
  where c.aluno_id = p_aluno_id and c.lei_id = p_lei_id and c.concluida = true
  order by c.concluida_em desc
  limit 1;
$$;
revoke all on function public.obter_resultado_campanha_lei(uuid, bigint) from public, anon, authenticated;
grant execute on function public.obter_resultado_campanha_lei(uuid, bigint) to service_role;

commit;
