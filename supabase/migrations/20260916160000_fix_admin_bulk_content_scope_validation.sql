begin;

-- The v2 function already materializes question IDs server-side.  Its
-- exclusive-target guard inverted "present" and "absent", rejecting a valid
-- question list with no structure.  Keep the published signature and replace
-- only that guard, so existing callers and grants remain compatible.
do $migration$
declare
  v_definition text;
  v_old_guard constant text := 'if (p_structure_id is null) = (coalesce(pg_catalog.cardinality(p_question_ids), 0) > 0) then';
  v_new_guard constant text := 'if (p_structure_id is null) = (coalesce(pg_catalog.cardinality(p_question_ids), 0) = 0) then';
begin
  select pg_catalog.pg_get_functiondef('public.admin_delete_law_content_v2(bigint,uuid[],bigint,uuid,text,boolean)'::pg_catalog.regprocedure)
    into v_definition;
  if v_definition is null then
    raise exception 'A função admin_delete_law_content_v2 não foi encontrada.' using errcode = 'P0002';
  end if;
  if pg_catalog.strpos(v_definition, v_old_guard) = 0 then
    raise exception 'A guarda de escopo esperada da função admin_delete_law_content_v2 não foi encontrada.' using errcode = 'P0001';
  end if;
  execute pg_catalog.replace(v_definition, v_old_guard, v_new_guard);
end
$migration$;

revoke all on function public.admin_delete_law_content_v2(bigint,uuid[],bigint,uuid,text,boolean) from public, anon, authenticated;
grant execute on function public.admin_delete_law_content_v2(bigint,uuid[],bigint,uuid,text,boolean) to service_role;

commit;
