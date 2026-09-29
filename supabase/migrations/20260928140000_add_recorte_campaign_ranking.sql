begin;

-- Incremental: a migration de contextos de recorte já foi aplicada. Mantém o
-- ranking de recorte isolado do ranking histórico da lei inteira.
create or replace function public.obter_resultado_campanha_recorte(p_aluno_id uuid,p_lei_id bigint,p_recorte_id uuid)
returns table(score_atual integer,melhor_score integer,melhor_score_em timestamptz,posicao bigint,participantes bigint)
language sql stable security definer set search_path='' as $function$
  with melhores as (
    select c.aluno_id,max(coalesce(c.score_ajustado,c.score)) melhor_score
    from public.campanhas_leis_alunos c
    where c.lei_id=p_lei_id and c.recorte_id=p_recorte_id and c.score_version=2 and c.concluida and not c.abandonada
    group by c.aluno_id
  ), classificados as (
    select m.aluno_id,m.melhor_score,min(c.score_competitivo_atualizado_em) filter(where coalesce(c.score_ajustado,c.score)=m.melhor_score) melhor_score_em
    from melhores m join public.campanhas_leis_alunos c on c.aluno_id=m.aluno_id and c.lei_id=p_lei_id and c.recorte_id=p_recorte_id and c.score_version=2 and c.concluida and not c.abandonada
    group by m.aluno_id,m.melhor_score
  ), ordenados as (
    select *,row_number() over(order by melhor_score desc,melhor_score_em asc nulls last,aluno_id asc) posicao,count(*) over() participantes from classificados
  )
  select coalesce(c.score_ajustado,c.score),o.melhor_score,o.melhor_score_em,o.posicao,o.participantes
  from public.campanhas_leis_alunos c join ordenados o on o.aluno_id=c.aluno_id
  where c.aluno_id=p_aluno_id and c.lei_id=p_lei_id and c.recorte_id=p_recorte_id and c.score_version=2 and c.concluida and not c.abandonada
  order by c.score_competitivo_atualizado_em desc nulls last limit 1;
$function$;
revoke all on function public.obter_resultado_campanha_recorte(uuid,bigint,uuid) from public,anon,authenticated;
grant execute on function public.obter_resultado_campanha_recorte(uuid,bigint,uuid) to service_role;

commit;
