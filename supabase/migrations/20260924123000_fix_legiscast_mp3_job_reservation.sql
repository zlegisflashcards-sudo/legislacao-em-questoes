begin;

-- O destino MP3 é reservado no job antes de o worker conhecer seu tamanho.
-- A publicação continua exigindo tamanho válido na RPC publish_legiscast_audio_job.
alter table public.legiscast_audio_jobs
  drop constraint if exists legiscast_audio_jobs_mp3_fields_check;

alter table public.legiscast_audio_jobs
  add constraint legiscast_audio_jobs_mp3_fields_check check (
    (mp3_path is null and mp3_size_bytes is null)
    or (
      pg_catalog.btrim(mp3_path) <> ''
      and (
        mp3_size_bytes is null
        or (mp3_size_bytes > 0 and mp3_size_bytes <= 52428800)
      )
    )
  );

commit;
