begin;

alter table public.legiscast_audios
  add column if not exists structure_id bigint references public.law_structure(id) on delete set null;
alter table public.legiscast_audio_jobs
  add column if not exists structure_id bigint references public.law_structure(id) on delete set null;

create index if not exists legiscast_audios_structure_ordem_idx
  on public.legiscast_audios (lei_id, structure_id, ordem, created_at);
create index if not exists legiscast_audio_jobs_structure_idx
  on public.legiscast_audio_jobs (lei_id, structure_id);
commit;

