begin;

-- Primeiro acesso e avisos de novas liberações são eventos diferentes. A chave
-- por evento impede repetição, sem impedir notificações futuras ao mesmo aluno.
create table if not exists public.alunos_notificacoes_acesso (
  id bigint generated always as identity primary key,
  aluno_id uuid not null references public.alunos(id) on delete restrict,
  idempotency_key text not null unique,
  tipo text not null check (tipo in ('nova_aquisicao','nova_liberacao')),
  status text not null check (status in ('reservado','enviado','falhou')),
  origem text not null,
  descricao text,
  erro text,
  criado_em timestamptz not null default pg_catalog.now(),
  enviado_em timestamptz
);

alter table public.alunos_notificacoes_acesso enable row level security;
revoke all on public.alunos_notificacoes_acesso from public, anon, authenticated;
grant select, insert, update on public.alunos_notificacoes_acesso to service_role;
grant usage, select on sequence public.alunos_notificacoes_acesso_id_seq to service_role;

comment on table public.alunos_notificacoes_acesso is
  'Avisos idempotentes de novas aquisicoes ou liberacoes; nunca armazena senha.';

commit;
