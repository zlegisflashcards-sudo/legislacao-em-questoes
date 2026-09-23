begin;
create table if not exists public.alunos_questoes_favoritas (
  aluno_id uuid not null references public.alunos(id) on delete cascade,
  questao_id uuid not null references public.questions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (aluno_id, questao_id)
);
create index if not exists alunos_questoes_favoritas_aluno_idx on public.alunos_questoes_favoritas (aluno_id, created_at desc);
alter table public.alunos_questoes_favoritas enable row level security;
revoke all on public.alunos_questoes_favoritas from public, anon, authenticated;
grant select, insert, delete on public.alunos_questoes_favoritas to service_role;
notify pgrst, 'reload schema';
comment on table public.alunos_questoes_favoritas is 'Vínculo persistente, individual e sem cópia de conteúdo entre aluno e questão favorita.';
commit;
