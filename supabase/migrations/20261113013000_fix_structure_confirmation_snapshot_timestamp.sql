begin;

-- A prévia administrativa usa Date#getTime(), que descarta a fração abaixo de
-- um milissegundo. O cast de double precision para bigint no PostgreSQL pode
-- arredondar para cima; por isso a RPC precisa explicitar floor(), mantendo o
-- mesmo contrato de fotografia entre Next.js e banco.
create or replace function public.confirmar_e_liberar_estrutura_legislativa(
  p_lei_id bigint,
  p_structure_id bigint,
  p_reference_ids uuid[],
  p_snapshot jsonb,
  p_ator_user_id uuid
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_snapshot jsonb;
  v_count integer;
begin
  perform pg_advisory_xact_lock(p_lei_id);
  lock table public.legislative_references, public.questions, public.law_structure,
    public.question_legislative_reference_links, public.legislative_structure_releases
    in share row exclusive mode;

  if not exists (select 1 from public.law_structure where id = p_structure_id and lei_id = p_lei_id and ativo = true) then
    raise exception using errcode = 'P0001', message = 'Estrutura não pertence à lei selecionada.';
  end if;
  if not exists (select 1 from public.leis where id = p_lei_id and ativo = true and status_publicacao = 'ativa') then
    raise exception using errcode = 'P0001', message = 'A lei não está ativa para disponibilização pública.';
  end if;
  if exists (
    with recursive descendants as (
      select id from public.law_structure where id = p_structure_id and lei_id = p_lei_id
      union all
      select child.id from public.law_structure child join descendants parent on child.parent_id = parent.id where child.lei_id = p_lei_id
    )
    select 1 from public.legislative_structure_releases release
      join descendants on descendants.id = release.structure_id
      where release.status = 'blocked' and release.structure_id <> p_structure_id
  ) then
    raise exception using errcode = 'P0001', message = 'Existe descendente bloqueado explicitamente.';
  end if;

  select jsonb_build_object(
    'references', coalesce((select jsonb_agg(jsonb_build_object(
      'id', r.id::text, 'updatedAt', floor(extract(epoch from r.updated_at) * 1000)::bigint,
      'structureId', r.structure_id, 'sourceQuestionId', r.source_question_id,
      'ordem', r.ordem, 'prepared', r.preparado_em is not null, 'situacao', r.situacao
    ) order by r.id::text) from public.legislative_references r where r.lei_id = p_lei_id and (r.situacao is null or r.situacao <> 'arquivada')), '[]'::jsonb),
    'questions', coalesce((select jsonb_agg(jsonb_build_object(
      'id', q.id::text, 'updatedAt', floor(extract(epoch from q.updated_at) * 1000)::bigint,
      'structureId', q.structure_id, 'ordem', q.ordem
    ) order by q.id::text) from public.questions q where q.lei_id = p_lei_id and q.ativo = true), '[]'::jsonb),
    'structures', coalesce((select jsonb_agg(jsonb_build_object(
      'id', s.id, 'updatedAt', floor(extract(epoch from s.updated_at) * 1000)::bigint,
      'parentId', s.parent_id, 'ordem', s.ordem, 'ativo', s.ativo
    ) order by s.id) from public.law_structure s where s.lei_id = p_lei_id and s.ativo = true), '[]'::jsonb),
    'manualLinks', coalesce((select jsonb_agg(jsonb_build_object('questionId', l.question_id::text, 'referenceId', l.reference_id::text) order by l.question_id::text)
      from public.question_legislative_reference_links l join public.questions q on q.id = l.question_id where q.lei_id = p_lei_id and q.ativo = true), '[]'::jsonb)
  ) into v_snapshot;
  if v_snapshot is distinct from p_snapshot then
    raise exception using errcode = 'P0001', message = 'O diagnóstico mudou desde a prévia. Atualize a confirmação.';
  end if;

  if cardinality(p_reference_ids) <> cardinality(array(select distinct unnest(p_reference_ids))) then
    raise exception using errcode = 'P0001', message = 'A lista de blocos possui UUIDs repetidos.';
  end if;
  select count(*) into v_count from public.legislative_references
    where lei_id = p_lei_id and id = any(p_reference_ids) and (situacao is null or situacao <> 'arquivada') and structure_id is null;
  if v_count <> cardinality(p_reference_ids) then
    raise exception using errcode = 'P0001', message = 'Um bloco não pertence à lei, já possui associação editorial ou foi alterado.';
  end if;

  update public.legislative_references set structure_id = p_structure_id
    where lei_id = p_lei_id and id = any(p_reference_ids) and structure_id is null;
  insert into public.legislative_structure_releases (structure_id, lei_id, status, released_at, released_by, blocked_at, blocked_by)
    values (p_structure_id, p_lei_id, 'released', now(), p_ator_user_id, null, null)
  on conflict (structure_id) do update set status = 'released', released_at = excluded.released_at, released_by = excluded.released_by, blocked_at = null, blocked_by = null, updated_at = now();
  perform public.admin_comercial_auditar(p_ator_user_id, 'liberar', 'liberacao_estrutura_lei', p_structure_id::text,
    null, jsonb_build_object('structure_id', p_structure_id, 'reference_ids', p_reference_ids),
    jsonb_build_object('origem', 'confirmacao_unica_lei_interativa', 'lei_id', p_lei_id));
  return jsonb_build_object('released', true, 'associated', cardinality(p_reference_ids));
end;
$$;

revoke all on function public.confirmar_e_liberar_estrutura_legislativa(bigint, bigint, uuid[], jsonb, uuid) from public, anon, authenticated;
grant execute on function public.confirmar_e_liberar_estrutura_legislativa(bigint, bigint, uuid[], jsonb, uuid) to service_role;

commit;
