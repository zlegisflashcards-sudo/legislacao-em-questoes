begin;

create table if not exists public.filtros_alunos_salvos (
  id bigint generated always as identity primary key,
  ator_user_id uuid not null references auth.users(id) on delete cascade,
  nome text not null check (btrim(nome) <> ''),
  filtros jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ator_user_id, nome)
);

create index if not exists filtros_alunos_salvos_ator_idx
  on public.filtros_alunos_salvos (ator_user_id, created_at desc);

alter table public.filtros_alunos_salvos enable row level security;
revoke all on public.filtros_alunos_salvos from public, anon, authenticated;
grant select, insert, update, delete on public.filtros_alunos_salvos to service_role;
grant usage, select on sequence public.filtros_alunos_salvos_id_seq to service_role;

commit;
