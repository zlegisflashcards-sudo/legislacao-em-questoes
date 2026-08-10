begin;

create table if not exists public.alunos_primeiro_acesso_envios (
  aluno_id uuid primary key references public.alunos(id) on delete restrict,
  origem text not null,
  idempotency_key text not null unique,
  status text not null check (status in ('reservado','enviado','falhou')),
  auth_user_id uuid references auth.users(id) on delete set null,
  erro text,
  criado_em timestamptz not null default pg_catalog.now(),
  enviado_em timestamptz
);

alter table public.alunos_primeiro_acesso_envios enable row level security;
revoke all on public.alunos_primeiro_acesso_envios from public, anon, authenticated;
grant select, insert, update on public.alunos_primeiro_acesso_envios to service_role;

comment on table public.alunos_primeiro_acesso_envios is
  'Reserva idempotente do e-mail de primeiro acesso; nunca armazena senha provisoria.';

commit;
