begin;
create table if not exists public.alunos_editais_ativos (
  aluno_id uuid primary key references public.alunos(id) on delete cascade,
  edital_tipo text not null check (edital_tipo in ('personalizado','produto')),
  edital_id text not null,
  updated_at timestamptz not null default pg_catalog.now()
);
alter table public.alunos_editais_ativos enable row level security;
revoke all on public.alunos_editais_ativos from public,anon,authenticated;
grant select,insert,update,delete on public.alunos_editais_ativos to service_role;
comment on table public.alunos_editais_ativos is 'Escolha persistida do edital em estudo; a composicao e o progresso permanecem em suas estruturas proprias.';
commit;
