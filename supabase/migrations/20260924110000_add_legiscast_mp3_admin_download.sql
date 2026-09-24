begin;

alter table public.legiscast_audio_jobs
  add column if not exists mp3_path text,
  add column if not exists mp3_size_bytes bigint;

alter table public.legiscast_audio_jobs
  drop constraint if exists legiscast_audio_jobs_mp3_fields_check;
alter table public.legiscast_audio_jobs
  add constraint legiscast_audio_jobs_mp3_fields_check check (
    (mp3_path is null and mp3_size_bytes is null)
    or (
      btrim(mp3_path) <> ''
      and mp3_size_bytes is not null
      and mp3_size_bytes > 0
      and mp3_size_bytes <= 52428800
    )
  );
create unique index if not exists legiscast_audio_jobs_mp3_path_unique
  on public.legiscast_audio_jobs (mp3_path)
  where mp3_path is not null;

-- Mantém chamadas do worker já publicado (quatro argumentos) compatíveis,
-- enquanto o worker novo envia também o MP3 administrativo.
drop function if exists public.publish_legiscast_audio_job(uuid, uuid, integer, bigint);
create function public.publish_legiscast_audio_job(
  p_job_id uuid,
  p_processing_token uuid,
  p_duration integer,
  p_final_size bigint,
  p_mp3_path text default null,
  p_mp3_size bigint default null
) returns boolean
language plpgsql
security definer
set search_path = ''
as $f$
declare v_job public.legiscast_audio_jobs;
begin
  select * into v_job
    from public.legiscast_audio_jobs
   where id = p_job_id
   for update;

  if not found
    or v_job.status <> 'processando'
    or v_job.processing_token is distinct from p_processing_token then
    return false;
  end if;

  if v_job.structure_id is not null and not exists (
    select 1 from public.law_structure s
     where s.id = v_job.structure_id and s.lei_id = v_job.lei_id
  ) then
    return false;
  end if;

  if p_duration is null or p_duration < 1
    or p_final_size is null or p_final_size < 1 or p_final_size > 52428800 then
    raise exception 'Resultado M4A inválido.' using errcode = '22023';
  end if;

  if v_job.mp3_path is not null and (
    p_mp3_path is distinct from v_job.mp3_path
    or p_mp3_size is null or p_mp3_size < 1 or p_mp3_size > 52428800
  ) then
    raise exception 'Resultado MP3 inválido.' using errcode = '22023';
  end if;

  insert into public.legiscast_audios(
    lei_id, structure_id, titulo, descricao, storage_path,
    duracao_segundos, ordem, ativo
  )
  select v_job.lei_id, v_job.structure_id, v_job.titulo, v_job.descricao,
         v_job.final_path, p_duration, v_job.ordem, v_job.ativo
   where not exists (
     select 1 from public.legiscast_audios a
      where a.storage_path = v_job.final_path
   );

  update public.legiscast_audio_jobs
     set status = 'concluido',
         final_mime = 'audio/mp4',
         final_size_bytes = p_final_size,
         mp3_path = case when v_job.mp3_path is null then null else p_mp3_path end,
         mp3_size_bytes = case when v_job.mp3_path is null then null else p_mp3_size end,
         duracao_segundos = p_duration,
         erro_codigo = null,
         erro_mensagem = null,
         finished_at = pg_catalog.now(),
         updated_at = pg_catalog.now()
   where id = v_job.id
     and status = 'processando'
     and processing_token = p_processing_token;

  return found;
end;
$f$;

revoke all on function public.publish_legiscast_audio_job(uuid, uuid, integer, bigint, text, bigint)
  from public, anon, authenticated;
grant execute on function public.publish_legiscast_audio_job(uuid, uuid, integer, bigint, text, bigint)
  to service_role;

commit;
