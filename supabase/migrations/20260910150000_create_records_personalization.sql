begin;

-- Mantém a matemática da RPC principal e entrega somente o recorte necessário
-- para a experiência personalizada de Records.
create function public.obter_detalhes_records_produto(
  p_produto_slug text,
  p_aluno_id uuid default null
)
returns jsonb
language sql
security definer
set search_path = public, pg_catalog
as $$
  with produto as (
    select id from public.produtos
    where slug = p_produto_slug and ativo = true and records_enabled = true
  ), leis_produto as (
    select pl.lei_id, pl.ordem, l.slug, l.titulo
    from produto p
    join public.produto_leis pl on pl.produto_id = p.id
    join public.leis l on l.id = pl.lei_id and l.ativo = true
  ), melhores as (
    select c.aluno_id, c.lei_id, max(coalesce(c.score_ajustado, c.score)) as melhor_score
    from public.campanhas_leis_alunos c
    join leis_produto lp on lp.lei_id = c.lei_id
    where c.score_version = 2
      and coalesce(c.score_ajustado, c.score) is not null
    group by c.aluno_id, c.lei_id
  ), melhores_com_data as (
    select m.aluno_id, m.lei_id, m.melhor_score,
      min(c.score_competitivo_atualizado_em) filter (where coalesce(c.score_ajustado, c.score) = m.melhor_score) as melhor_score_em
    from melhores m
    join public.campanhas_leis_alunos c on c.aluno_id = m.aluno_id and c.lei_id = m.lei_id and c.score_version = 2
    group by m.aluno_id, m.lei_id, m.melhor_score
  ), totais as (
    select aluno_id, sum(melhor_score)::bigint as score_total, max(melhor_score_em) as score_total_em
    from melhores_com_data group by aluno_id
  ), ordenados as (
    select row_number() over (order by score_total desc, score_total_em asc nulls last, aluno_id asc) as posicao, aluno_id, score_total
    from totais
  ), atual as (
    select * from ordenados where aluno_id = p_aluno_id
  ), limites_proximos as (
    select greatest(1::bigint, least(a.posicao - 5, greatest((select count(*) from ordenados) - 9, 1))) as inicio
    from atual a where a.posicao > 10
  )
  select jsonb_build_object(
    'top10', coalesce((select jsonb_agg(jsonb_build_object('posicao', posicao, 'aluno_id', aluno_id, 'score_total', score_total) order by posicao) from ordenados where posicao <= 10), '[]'::jsonb),
    'current_user', (select jsonb_build_object('posicao', posicao, 'aluno_id', aluno_id, 'score_total', score_total) from atual),
    'nearby', coalesce((select jsonb_agg(jsonb_build_object('posicao', o.posicao, 'aluno_id', o.aluno_id, 'score_total', o.score_total) order by o.posicao) from ordenados o join limites_proximos l on o.posicao between l.inicio and l.inicio + 9), '[]'::jsonb),
    'laws', coalesce((select jsonb_agg(jsonb_build_object('lei_id', lp.lei_id, 'slug', lp.slug, 'titulo', lp.titulo, 'score', coalesce((select m.melhor_score from melhores m where m.aluno_id = p_aluno_id and m.lei_id = lp.lei_id), 0)) order by lp.ordem, lp.lei_id) from leis_produto lp), '[]'::jsonb)
  );
$$;

revoke all on function public.obter_detalhes_records_produto(text, uuid) from public, anon, authenticated;
grant execute on function public.obter_detalhes_records_produto(text, uuid) to service_role;

commit;
