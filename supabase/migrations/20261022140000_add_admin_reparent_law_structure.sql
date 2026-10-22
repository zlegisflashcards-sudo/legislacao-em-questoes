begin;

create or replace function public.admin_reparent_law_structure(
  p_actor_user_id uuid,
  p_lei_id bigint,
  p_structure_id bigint,
  p_new_parent_id bigint,
  p_expected_parent_id bigint,
  p_expected_ordem integer,
  p_expected_updated_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_before public.law_structure;
  v_after public.law_structure;
  v_destination public.law_structure;
begin
  perform public.admin_comercial_validar_contexto(p_actor_user_id);
  perform pg_catalog.pg_advisory_xact_lock(p_lei_id);

  select * into v_before from public.law_structure
    where id = p_structure_id and lei_id = p_lei_id and ativo = true for update;
  if not found then raise exception using errcode = 'P0002', message = 'Estrutura ativa nao encontrada.'; end if;
  if v_before.parent_id is distinct from p_expected_parent_id or v_before.ordem <> p_expected_ordem or v_before.updated_at <> p_expected_updated_at then
    raise exception using errcode = '40001', message = 'A estrutura mudou desde a previa. Gere uma nova previa antes de confirmar.';
  end if;
  if p_new_parent_id is not null then
    select * into v_destination from public.law_structure where id = p_new_parent_id and ativo = true for update;
    if not found or v_destination.lei_id <> p_lei_id then raise exception using errcode = '23503', message = 'A estrutura superior deve pertencer a mesma lei.'; end if;
    if p_new_parent_id = p_structure_id then raise exception using errcode = '22023', message = 'Uma estrutura nao pode ser pai de si mesma.'; end if;
    if exists (with recursive descendants as (select id from public.law_structure where parent_id = p_structure_id and lei_id = p_lei_id union all select child.id from public.law_structure child join descendants parent on child.parent_id = parent.id where child.lei_id = p_lei_id) select 1 from descendants where id = p_new_parent_id) then
      raise exception using errcode = '22023', message = 'Nao e permitido mover uma estrutura para dentro de sua descendencia.';
    end if;
  end if;
  if v_before.parent_id is not distinct from p_new_parent_id then raise exception using errcode = '22023', message = 'A estrutura ja esta neste nivel superior.'; end if;
  if exists (select 1 from public.law_structure s where s.lei_id = p_lei_id and s.ativo = true and s.id <> p_structure_id and s.parent_id is not distinct from p_new_parent_id and s.ordem = v_before.ordem) then
    raise exception using errcode = '23505', message = 'A posicao ja e usada no novo nivel. Ajuste a posicao antes de mover.';
  end if;
  update public.law_structure set parent_id = p_new_parent_id where id = p_structure_id returning * into v_after;
  perform public.admin_comercial_auditar(p_actor_user_id, 'mover_estrutura_superior', 'estrutura_lei', p_structure_id::text, pg_catalog.to_jsonb(v_before), pg_catalog.to_jsonb(v_after), pg_catalog.jsonb_build_object('origem','administracao_estrutura','lei_id',p_lei_id));
  return pg_catalog.to_jsonb(v_after);
end
$function$;

revoke all on function public.admin_reparent_law_structure(uuid,bigint,bigint,bigint,bigint,integer,timestamptz) from public, anon, authenticated;
grant execute on function public.admin_reparent_law_structure(uuid,bigint,bigint,bigint,bigint,integer,timestamptz) to service_role;
commit;
