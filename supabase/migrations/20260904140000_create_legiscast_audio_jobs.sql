begin;

create table if not exists public.legiscast_audio_jobs (
  id uuid primary key default gen_random_uuid(),
  lei_id bigint not null references public.leis(id) on delete cascade,
  titulo text not null check (btrim(titulo) <> ''),
  descricao text,
  ordem integer not null default 0 check (ordem >= 0),
  ativo boolean not null default true,
  status text not null default 'pendente' check (status in ('pendente', 'processando', 'concluido', 'erro')),
  original_bucket text not null check (btrim(original_bucket) <> ''),
  original_path text not null unique check (btrim(original_path) <> ''),
  original_mime text not null check (btrim(original_mime) <> ''),
  original_size_bytes bigint not null check (original_size_bytes > 0 and original_size_bytes <= 524288000),
  final_path text not null unique check (btrim(final_path) <> ''),
  final_mime text,
  final_size_bytes bigint check (final_size_bytes is null or (final_size_bytes > 0 and final_size_bytes <= 52428800)),
  duracao_segundos integer check (duracao_segundos is null or duracao_segundos >= 0),
  erro_codigo text,
  erro_mensagem text,
  tentativas integer not null default 0 check (tentativas >= 0 and tentativas <= 3),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint legiscast_audio_jobs_final_fields check (
    (status <> 'concluido') or (final_mime = 'audio/mp4' and final_size_bytes is not null and duracao_segundos is not null)
  )
);

create index if not exists legiscast_audio_jobs_admin_idx
  on public.legiscast_audio_jobs (status, created_at desc);
create index if not exists legiscast_audio_jobs_law_idx
  on public.legiscast_audio_jobs (lei_id, created_at desc);

alter table public.legiscast_audio_jobs enable row level security;
revoke all on table public.legiscast_audio_jobs from public, anon, authenticated;
grant select, insert, update, delete on table public.legiscast_audio_jobs to service_role;

-- Claim atômico: somente uma execução pode mover o job pendente para processamento.
create or replace function public.claim_legiscast_audio_job(p_job_id uuid)
returns setof public.legiscast_audio_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.legiscast_audio_jobs
     set status = 'processando',
         tentativas = tentativas + 1,
         started_at = now(),
         finished_at = null,
         erro_codigo = null,
         erro_mensagem = null,
         updated_at = now()
   where id = p_job_id
     and status = 'pendente'
     and tentativas < 3
  returning *;
end;
$$;

revoke all on function public.claim_legiscast_audio_job(uuid) from public, anon, authenticated;
grant execute on function public.claim_legiscast_audio_job(uuid) to service_role;

commit;
