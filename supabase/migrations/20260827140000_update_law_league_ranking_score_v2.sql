begin;

-- Cada lei contribui uma única vez com o melhor score competitivo V2 do aluno.
create or replace function public.obter_ranking_liga(
  p_liga_slug text,
  p_aluno_id uuid default null,
  p_limite integer default 10
)
returns table(posicao bigint, aluno_id uuid, score_total bigint)
language sql
security definer
set search_path = public, pg_catalog
as $$
  with liga as (
    select id from public.ligas where slug = p_liga_slug and ativo = true
  ), melhores as (
    select c.aluno_id, c.lei_id, max(coalesce(c.score_ajustado, c.score)) as melhor_score
    from public.campanhas_leis_alunos as c
    join public.ligas_leis as ll on ll.lei_id = c.lei_id
    join liga on liga.id = ll.liga_id
    where c.score_version = 2
      and coalesce(c.score_ajustado, c.score) is not null
    group by c.aluno_id, c.lei_id
  ), melhores_com_data as (
    select m.aluno_id, m.lei_id, m.melhor_score,
      min(c.score_competitivo_atualizado_em) filter (where coalesce(c.score_ajustado, c.score) = m.melhor_score) as melhor_score_em
    from melhores as m
    join public.campanhas_leis_alunos as c
      on c.aluno_id = m.aluno_id
      and c.lei_id = m.lei_id
      and c.score_version = 2
    group by m.aluno_id, m.lei_id, m.melhor_score
  ), totais as (
    select aluno_id, sum(melhor_score)::bigint as score_total, max(melhor_score_em) as score_total_em
    from melhores_com_data
    group by aluno_id
  ), ordenados as (
    select row_number() over (order by score_total desc, score_total_em asc nulls last, aluno_id asc) as posicao,
      aluno_id, score_total
    from totais
  )
  select posicao, aluno_id, score_total
  from ordenados
  where posicao <= case when p_limite between 1 and 100 then p_limite else 10 end
    or aluno_id = p_aluno_id
  order by posicao;
$$;

commit;
