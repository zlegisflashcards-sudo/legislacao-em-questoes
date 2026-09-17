begin;

alter table public.legiscast_audio_jobs
  add column if not exists processing_token uuid,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid;
alter table public.legiscast_audio_jobs drop constraint if exists legiscast_audio_jobs_status_check;
alter table public.legiscast_audio_jobs add constraint legiscast_audio_jobs_status_check check (status in ('pendente','processando','concluido','erro','cancelado'));

-- A troca de imagem do worker precisa poder pausar a tomada de jobs sem
-- alterar nem cancelar os itens que já estão na fila.  O controle fica no
-- banco para também proteger execuções da imagem anterior que tenham sido
-- iniciadas antes de a aplicação nova chegar à Vercel.
create table if not exists public.legiscast_audio_dispatch_control (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default true,
  updated_at timestamptz not null default pg_catalog.now()
);
insert into public.legiscast_audio_dispatch_control(singleton, enabled)
values (true, true)
on conflict (singleton) do nothing;
alter table public.legiscast_audio_dispatch_control enable row level security;

create or replace function public.set_legiscast_audio_dispatch_enabled(p_enabled boolean)
returns void language plpgsql security definer set search_path = '' as $f$
begin
  insert into public.legiscast_audio_dispatch_control(singleton, enabled, updated_at)
  values (true, p_enabled, pg_catalog.now())
  on conflict (singleton) do update set enabled=excluded.enabled, updated_at=excluded.updated_at;
end $f$;

create or replace function public.claim_legiscast_audio_job(p_job_id uuid)
returns setof public.legiscast_audio_jobs language plpgsql security definer set search_path = '' as $f$
begin
  return query update public.legiscast_audio_jobs set status='processando', processing_token=pg_catalog.gen_random_uuid(), tentativas=tentativas+1, started_at=pg_catalog.now(), finished_at=null, erro_codigo=null, erro_mensagem=null, updated_at=pg_catalog.now()
  where id=p_job_id and status='pendente' and tentativas<3
    and exists (select 1 from public.legiscast_audio_dispatch_control where singleton and enabled)
  returning *;
end $f$;

create or replace function public.publish_legiscast_audio_job(
  p_job_id uuid, p_processing_token uuid, p_duration integer, p_final_size bigint
) returns boolean language plpgsql security definer set search_path = '' as $f$
declare v_job public.legiscast_audio_jobs;
begin
  select * into v_job from public.legiscast_audio_jobs where id=p_job_id for update;
  if not found or v_job.status <> 'processando' or v_job.processing_token is distinct from p_processing_token then return false; end if;
  if v_job.structure_id is not null and not exists (select 1 from public.law_structure s where s.id=v_job.structure_id and s.lei_id=v_job.lei_id) then return false; end if;
  insert into public.legiscast_audios(lei_id,structure_id,titulo,descricao,storage_path,duracao_segundos,ordem,ativo)
    select v_job.lei_id,v_job.structure_id,v_job.titulo,v_job.descricao,v_job.final_path,p_duration,v_job.ordem,v_job.ativo
    where not exists (select 1 from public.legiscast_audios a where a.storage_path=v_job.final_path);
  update public.legiscast_audio_jobs set status='concluido',final_mime='audio/mp4',final_size_bytes=p_final_size,duracao_segundos=p_duration,erro_codigo=null,erro_mensagem=null,finished_at=pg_catalog.now(),updated_at=pg_catalog.now()
    where id=v_job.id and status='processando' and processing_token=p_processing_token;
  return found;
end $f$;

create or replace function public.admin_delete_law_content_v3(
  p_lei_id bigint,p_question_ids uuid[] default null,p_structure_id bigint default null,p_actor_user_id uuid default null,p_confirmation text default null,p_execute boolean default false,p_job_action text default null
) returns jsonb language plpgsql security definer set search_path = '' as $f$
declare v_summary jsonb; v_jobs jsonb := '[]'::jsonb; v_active integer := 0; v_terminal integer := 0; v_ids bigint[] := '{}'::bigint[];
begin
  if p_structure_id is null then return public.admin_delete_law_content_v2(p_lei_id,p_question_ids,null,p_actor_user_id,p_confirmation,p_execute); end if;
  perform pg_catalog.pg_advisory_xact_lock(p_lei_id);
  with recursive d as (select id from public.law_structure where id=p_structure_id and lei_id=p_lei_id union all select s.id from public.law_structure s join d on s.parent_id=d.id where s.lei_id=p_lei_id)
  select coalesce(array_agg(id),'{}'::bigint[]) into v_ids from d;
  if cardinality(v_ids)=0 then raise exception 'Estrutura nao encontrada para esta lei.' using errcode='P0002'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',j.id,'title',j.titulo,'status',j.status,'structure_id',j.structure_id) order by j.created_at),'[]'::jsonb), count(*) filter(where j.status in ('pendente','processando')), count(*) filter(where j.status in ('concluido','erro','cancelado')) into v_jobs,v_active,v_terminal
    from public.legiscast_audio_jobs j where j.lei_id=p_lei_id and j.structure_id=any(v_ids);
  v_summary:=public.admin_delete_law_content_v2(p_lei_id,null,p_structure_id,p_actor_user_id,p_confirmation,false);
  v_summary:=v_summary || jsonb_build_object('jobs',v_jobs,'jobs_active_count',v_active,'jobs_terminal_count',v_terminal,'job_action_required',case when v_active>0 then 'cancel_active' when v_terminal>0 then 'detach_completed' else null end,'dependencies_count',greatest(coalesce((v_summary->>'dependencies_count')::integer,0)-jsonb_array_length(coalesce(v_summary->'dependencies'->'jobs','[]'::jsonb)),0));
  if not p_execute then return v_summary; end if;
  lock table public.legiscast_audio_jobs in share row exclusive mode;
  select count(*) filter(where status in ('pendente','processando')), count(*) filter(where status in ('concluido','erro','cancelado')) into v_active,v_terminal from public.legiscast_audio_jobs where lei_id=p_lei_id and structure_id=any(v_ids);
  if v_active>0 and p_job_action is distinct from 'cancel_active' then raise exception 'Existem jobs pendentes ou processando. Confirme o cancelamento antes de excluir.' using errcode='22023'; end if;
  if v_active=0 and v_terminal>0 and p_job_action is distinct from 'detach_completed' then raise exception 'Existem jobs encerrados. Confirme o desvinculo antes de excluir.' using errcode='22023'; end if;
  if p_job_action not in ('cancel_active','detach_completed') and (v_active+v_terminal)>0 then raise exception 'Acao de job invalida.' using errcode='22023'; end if;
  update public.legiscast_audio_jobs set status='cancelado',cancelled_at=pg_catalog.now(),cancelled_by=p_actor_user_id,processing_token=null,finished_at=pg_catalog.now(),erro_codigo='structure_deleted',erro_mensagem='Processamento cancelado pela exclusao da estrutura.',structure_id=null,updated_at=pg_catalog.now() where lei_id=p_lei_id and structure_id=any(v_ids) and status in ('pendente','processando');
  update public.legiscast_audio_jobs set structure_id=null,updated_at=pg_catalog.now() where lei_id=p_lei_id and structure_id=any(v_ids) and status in ('concluido','erro','cancelado');
  return public.admin_delete_law_content_v2(p_lei_id,null,p_structure_id,p_actor_user_id,p_confirmation,true);
end $f$;

revoke all on function public.claim_legiscast_audio_job(uuid) from public,anon,authenticated;
revoke all on function public.publish_legiscast_audio_job(uuid,uuid,integer,bigint) from public,anon,authenticated;
revoke all on function public.admin_delete_law_content_v3(bigint,uuid[],bigint,uuid,text,boolean,text) from public,anon,authenticated;
revoke all on function public.set_legiscast_audio_dispatch_enabled(boolean) from public,anon,authenticated;
grant execute on function public.claim_legiscast_audio_job(uuid),public.publish_legiscast_audio_job(uuid,uuid,integer,bigint),public.admin_delete_law_content_v3(bigint,uuid[],bigint,uuid,text,boolean,text),public.set_legiscast_audio_dispatch_enabled(boolean) to service_role;
commit;
