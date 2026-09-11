begin;

alter table public.legiscast_audios
  alter column titulo drop not null,
  drop constraint if exists legiscast_audios_titulo_check;

alter table public.legiscast_audio_jobs
  alter column titulo drop not null,
  drop constraint if exists legiscast_audio_jobs_titulo_check;

commit;
