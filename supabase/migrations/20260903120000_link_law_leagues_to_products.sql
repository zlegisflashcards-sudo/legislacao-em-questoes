begin;

-- A Liga guarda somente qual produto representa o edital. As leis continuam
-- pertencendo exclusivamente à composição viva de public.produto_leis.
alter table public.ligas
  add column if not exists produto_id uuid references public.produtos(id) on delete restrict,
  add column if not exists subtitulo text,
  add column if not exists cta_label text,
  add column if not exists cta_href text;

create index if not exists ligas_produto_idx on public.ligas(produto_id);
create unique index if not exists ligas_produto_unico_idx on public.ligas(produto_id) where produto_id is not null;

update public.ligas as liga
set produto_id = produto.id,
    nome = coalesce(nullif(liga.nome, ''), 'Liga PMMA'),
    titulo = 'Ranking Legis Questões',
    subtitulo = coalesce(nullif(liga.subtitulo, ''), 'Some seus melhores scores nas leis do edital e suba no ranking.'),
    imagem_url = coalesce(nullif(liga.imagem_url, ''), '/league/pmma-hero.png'),
    cta_label = coalesce(nullif(liga.cta_label, ''), '🎮 Quero entrar na Liga PMMA'),
    updated_at = now()
from public.produtos as produto
where liga.slug = 'pmma'
  and produto.slug = 'pmmasd'
  and produto.tipo_produto = 'edital'
  and produto.ativo = true
  and liga.produto_id is distinct from produto.id;

-- Mantém a assinatura pública já consumida pela aplicação. A única mudança de
-- escopo é trocar a fonte das leis de ligas_leis para produto_leis.
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
    select liga.produto_id
    from public.ligas as liga
    join public.produtos as produto on produto.id = liga.produto_id and produto.ativo = true
    where liga.slug = p_liga_slug
      and liga.ativo = true
      and liga.produto_id is not null
  ), melhores as (
    select c.aluno_id, c.lei_id, max(coalesce(c.score_ajustado, c.score)) as melhor_score
    from public.campanhas_leis_alunos as c
    join liga on true
    join public.produto_leis as pl on pl.produto_id = liga.produto_id and pl.lei_id = c.lei_id
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
