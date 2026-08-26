begin;

create or replace function public.obter_destinatarios_aviso_lei(p_lei_id bigint)
returns table(aluno_id uuid)
language sql stable security definer set search_path=pg_catalog as $$
  select distinct l.aluno_id
  from public.liberacoes_leis l
  where l.lei_id=p_lei_id and l.status='ativo'
$$;

create or replace function public.publish_law_update_notice(p_notice_id uuid)
returns integer language plpgsql security definer set search_path=pg_catalog as $$
declare v_law bigint; v_status text; v_count integer;
begin
  select law_id,status into v_law,v_status from public.law_update_notices where id=p_notice_id for update;
  if not found or v_status='discarded' then raise exception 'Draft notice not found'; end if;
  if v_status='published' then select count(*)::integer into v_count from public.law_update_notice_deliveries where notice_id=p_notice_id; return v_count; end if;
  update public.law_update_notices set status='published',published_at=now() where id=p_notice_id;
  insert into public.law_update_notice_deliveries(notice_id,student_id)
    select p_notice_id,r.aluno_id from public.obter_destinatarios_aviso_lei(v_law) r
    on conflict (notice_id,student_id) do nothing;
  get diagnostics v_count=row_count; return v_count;
end $$;

revoke all on function public.obter_destinatarios_aviso_lei(bigint) from public,anon,authenticated;
grant execute on function public.obter_destinatarios_aviso_lei(bigint) to service_role;
revoke all on function public.publish_law_update_notice(uuid) from public,anon,authenticated;
grant execute on function public.publish_law_update_notice(uuid) to service_role;
commit;
