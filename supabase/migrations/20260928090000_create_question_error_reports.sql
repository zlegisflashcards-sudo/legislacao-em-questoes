begin;

create table if not exists public.question_error_reports (
  id uuid primary key default gen_random_uuid(),
  questao_id uuid references public.questions(id) on delete set null,
  aluno_id uuid references public.alunos(id) on delete set null,
  lei_id bigint references public.leis(id) on delete set null,
  lei_slug text,
  lei_titulo text,
  codigo text,
  ordem text,
  assunto text,
  descricao text not null default '',
  status text not null default 'pendente' check (status in ('pendente', 'em_analise', 'resolvido', 'descartado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists question_error_reports_status_created_idx on public.question_error_reports (status, created_at desc);
create index if not exists question_error_reports_questao_idx on public.question_error_reports (questao_id) where questao_id is not null;
alter table public.question_error_reports enable row level security;
revoke all on public.question_error_reports from public, anon, authenticated;
grant select, insert, update on public.question_error_reports to service_role;
comment on table public.question_error_reports is 'Reports de erro ligados tecnicamente ao UUID da questão; snapshots preservam relatórios mesmo após exclusão do conteúdo.';
commit;
