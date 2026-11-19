begin;

-- Libera a lei inteira somente após o servidor ter confirmado, com a mesma
-- fotografia de integridade, que todas as estruturas estão prontas. A função
-- não ativa o modo parcial: ela apenas grava os registros editoriais de
-- liberação de forma atômica.
create or replace function public.liberar_lei_interativa_completa(
  p_lei_id bigint,
  p_structure_ids bigint[],
  p_snapshot jsonb,
  p_ator_user_id uuid
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_snapshot jsonb;
  v_expected_structure_ids bigint[];
  v_released integer := 0;
begin
  perform public.admin_comercial_validar_contexto(p_ator_user_id);
  perform pg_advisory_xact_lock(p_lei_id);
  lock table public.legislative_references, public.questions, public.law_structure,
    public.question_legislative_reference_links, public.legislative_structure_releases
    in share row exclusive mode;

  if not exists (select 1 from public.leis where id = p_lei_id and ativo = true and status_publicacao = 'ativa') then
    raise exception using errcode = 'P0001', message = 'A lei não está ativa para disponibilização pública.';
  end if;
  if cardinality(p_structure_ids) is null or cardinality(p_structure_ids) = 0
    or cardinality(p_structure_ids) <> cardinality(array(select distinct unnest(p_structure_ids))) then
    raise exception using errcode = 'P0001', message = 'A lista de estruturas é inválida.';
  end if;
  select coalesce(array_agg(id order by id), '{}'::bigint[]) into v_expected_structure_ids
    from public.law_structure where lei_id = p_lei_id and ativo = true;
  if p_structure_ids is distinct from v_expected_structure_ids then
    raise exception using errcode = 'P0001', message = 'As estruturas da lei mudaram desde a conferência.';
  end if;
  if exists (select 1 from public.legislative_structure_releases where lei_id = p_lei_id and status = 'blocked') then
    raise exception using errcode = 'P0001', message = 'Existe estrutura bloqueada explicitamente.';
  end if;

  select jsonb_build_object(
    'references', coalesce((select jsonb_agg(jsonb_build_object(
      'id', r.id::text, 'updatedAt', (extract(epoch from r.updated_at) * 1000)::bigint,
      'structureId', r.structure_id, 'sourceQuestionId', r.source_question_id,
      'ordem', r.ordem, 'prepared', r.preparado_em is not null, 'situacao', r.situacao
    ) order by r.id::text) from public.legislative_references r where r.lei_id = p_lei_id and (r.situacao is null or r.situacao <> 'arquivada')), '[]'::jsonb),
    'questions', coalesce((select jsonb_agg(jsonb_build_object(
      'id', q.id::text, 'updatedAt', (extract(epoch from q.updated_at) * 1000)::bigint,
      'structureId', q.structure_id, 'ordem', q.ordem
    ) order by q.id::text) from public.questions q where q.lei_id = p_lei_id and q.ativo = true), '[]'::jsonb),
    'structures', coalesce((select jsonb_agg(jsonb_build_object(
      'id', s.id, 'updatedAt', (extract(epoch from s.updated_at) * 1000)::bigint,
      'parentId', s.parent_id, 'ordem', s.ordem, 'ativo', s.ativo
    ) order by s.id) from public.law_structure s where s.lei_id = p_lei_id and s.ativo = true), '[]'::jsonb),
    'manualLinks', coalesce((select jsonb_agg(jsonb_build_object('questionId', l.question_id::text, 'referenceId', l.reference_id::text) order by l.question_id::text)
      from public.question_legislative_reference_links l join public.questions q on q.id = l.question_id where q.lei_id = p_lei_id and q.ativo = true), '[]'::jsonb)
  ) into v_snapshot;
  if v_snapshot is distinct from p_snapshot then
    raise exception using errcode = 'P0001', message = 'O diagnóstico mudou desde a conferência.';
  end if;

  insert into public.legislative_structure_releases (structure_id, lei_id, status, released_at, released_by, blocked_at, blocked_by)
    select selected_structure.structure_id, p_lei_id, 'released', now(), p_ator_user_id, null, null
    from unnest(p_structure_ids) as selected_structure(structure_id)
  on conflict (structure_id) do update set
    status = 'released', released_at = excluded.released_at, released_by = excluded.released_by,
    blocked_at = null, blocked_by = null, updated_at = now()
  where public.legislative_structure_releases.status is distinct from 'released';
  get diagnostics v_released = row_count;

  if v_released > 0 then
    perform public.admin_comercial_auditar(
      p_ator_user_id, 'liberar', 'liberacao_lei_interativa_completa', p_lei_id::text,
      null, jsonb_build_object('structure_ids', p_structure_ids),
      jsonb_build_object('origem', 'liberacao_integral_manual', 'estruturas_liberadas', v_released)
    );
  end if;
  return jsonb_build_object('released', v_released);
end;
$$;

revoke all on function public.liberar_lei_interativa_completa(bigint, bigint[], jsonb, uuid) from public, anon, authenticated;
grant execute on function public.liberar_lei_interativa_completa(bigint, bigint[], jsonb, uuid) to service_role;

commit;

-- Rollback manual seguro, apenas se esta for a última migration aplicada:
-- begin;
-- drop function if exists public.liberar_lei_interativa_completa(bigint, bigint[], jsonb, uuid);
-- commit;
