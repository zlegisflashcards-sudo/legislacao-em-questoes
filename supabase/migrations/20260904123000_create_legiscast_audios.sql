begin;

create table if not exists public.legiscast_audios (
  id uuid primary key default gen_random_uuid(),
  lei_id bigint not null references public.leis(id) on delete cascade,
  titulo text not null check (btrim(titulo) <> ''),
  descricao text,
  storage_path text not null unique check (btrim(storage_path) <> ''),
  duracao_segundos integer check (duracao_segundos is null or duracao_segundos >= 0),
  ordem integer not null default 0 check (ordem >= 0),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists legiscast_audios_lei_ordem_idx on public.legiscast_audios (lei_id, ativo, ordem, created_at);

alter table public.legiscast_audios enable row level security;
revoke all on table public.legiscast_audios from public, anon, authenticated;
grant select, insert, update, delete on table public.legiscast_audios to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('legiscast-audio', 'legiscast-audio', false, 104857600, array['audio/mpeg', 'audio/mp4', 'audio/x-m4a'])
on conflict (id) do update set public = false, file_size_limit = 104857600, allowed_mime_types = array['audio/mpeg', 'audio/mp4', 'audio/x-m4a'];

commit;
