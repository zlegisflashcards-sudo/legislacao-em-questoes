begin;

-- O score calculado permanece imutável em `score`. Esta coluna é somente a
-- exceção administrativa auditável usada como score efetivo no ranking.
alter table public.campanhas_leis_alunos
  add column if not exists score_ajustado integer
  check (score_ajustado between 0 and 10000);

create index if not exists campanhas_leis_alunos_ranking_efetivo_idx
  on public.campanhas_leis_alunos
  (lei_id, aluno_id, (coalesce(score_ajustado, score)) desc, concluida_em asc, id asc)
  where concluida;

create or replace function public.admin_ajustar_score_campanha(
  p_ator_user_id uuid,
  p_campanha_id uuid,
  p_novo_score integer,
  p_motivo text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $function$
declare
  v_before public.campanhas_leis_alunos;
  v_after public.campanhas_leis_alunos;
  v_motivo text;
begin
  perform public.admin_comercial_validar_contexto(p_ator_user_id);
  v_motivo := pg_catalog.btrim(coalesce(p_motivo, ''));
  if p_campanha_id is null or p_novo_score is null or p_novo_score < 0 or p_novo_score > 10000 or v_motivo = '' then
    raise exception using errcode = '22023', message = 'Ajuste de score inválido.';
  end if;

  select * into v_before from public.campanhas_leis_alunos where id = p_campanha_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Campanha não encontrada.'; end if;
  if not v_before.concluida then raise exception using errcode = '22023', message = 'Somente campanhas concluídas podem receber ajuste de score.'; end if;
  if p_novo_score = coalesce(v_before.score_ajustado, v_before.score) then
    raise exception using errcode = '22023', message = 'O novo score deve ser diferente do score efetivo atual.';
  end if;

  update public.campanhas_leis_alunos
    set score_ajustado = p_novo_score
    where id = p_campanha_id
    returning * into v_after;

  perform public.admin_comercial_auditar(
    p_ator_user_id,
    'ajustar_score',
    'campanha_lei',
    v_after.id::text,
    pg_catalog.to_jsonb(v_before),
    pg_catalog.to_jsonb(v_after),
    pg_catalog.jsonb_build_object(
      'aluno_id', v_after.aluno_id,
      'lei_id', v_after.lei_id,
      'score_original', v_before.score,
      'score_efetivo_anterior', coalesce(v_before.score_ajustado, v_before.score),
      'score_novo', p_novo_score,
      'motivo', v_motivo
    )
  );
  return pg_catalog.jsonb_build_object(
    'id', v_after.id,
    'score_original', v_after.score,
    'score_ajustado', v_after.score_ajustado,
    'score_efetivo', coalesce(v_after.score_ajustado, v_after.score)
  );
end;
$function$;

revoke all on function public.admin_ajustar_score_campanha(uuid, uuid, integer, text) from public, anon, authenticated;
grant execute on function public.admin_ajustar_score_campanha(uuid, uuid, integer, text) to service_role;

create or replace function public.obter_resultado_campanha_lei(p_aluno_id uuid, p_lei_id bigint)
returns table(score_atual integer, melhor_score integer, melhor_score_em timestamptz, posicao bigint, participantes bigint)
language sql security definer set search_path = public as $$
  with melhores as (
    select aluno_id, lei_id, max(coalesce(score_ajustado, score)) as melhor_score
    from campanhas_leis_alunos where lei_id = p_lei_id and concluida = true
    group by aluno_id, lei_id
  ), classificados as (
    select m.aluno_id, m.melhor_score,
      min(c.concluida_em) filter (where coalesce(c.score_ajustado, c.score) = m.melhor_score) as melhor_score_em
    from melhores m join campanhas_leis_alunos c on c.aluno_id = m.aluno_id and c.lei_id = m.lei_id and c.concluida = true
    group by m.aluno_id, m.melhor_score
  ), ordenados as (
    select *, row_number() over (order by melhor_score desc, melhor_score_em asc, aluno_id asc) as posicao, count(*) over () as participantes
    from classificados
  )
  select coalesce(c.score_ajustado, c.score), o.melhor_score, o.melhor_score_em, o.posicao, o.participantes
  from campanhas_leis_alunos c join ordenados o on o.aluno_id = c.aluno_id
  where c.aluno_id = p_aluno_id and c.lei_id = p_lei_id and c.concluida = true
  order by c.concluida_em desc limit 1;
$$;

commit;
