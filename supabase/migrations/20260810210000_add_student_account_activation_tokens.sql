begin;

create table if not exists public.alunos_ativacoes_pendentes (
  id uuid primary key default gen_random_uuid(),
  aluno_id uuid not null references public.alunos(id),
  token_hash text not null unique,
  expires_at timestamptz not null,
  reserved_at timestamptz,
  used_at timestamptz,
  invalidated_at timestamptz,
  created_at timestamptz not null default now(),
  constraint alunos_ativacoes_pendentes_expiracao_check check (expires_at > created_at)
);

create index if not exists alunos_ativacoes_pendentes_aluno_pendente_idx
  on public.alunos_ativacoes_pendentes(aluno_id, expires_at desc)
  where used_at is null and invalidated_at is null and reserved_at is null;

alter table public.alunos_ativacoes_pendentes enable row level security;
revoke all on public.alunos_ativacoes_pendentes from public, anon, authenticated;
grant select, insert, update on public.alunos_ativacoes_pendentes to service_role;

comment on table public.alunos_ativacoes_pendentes is
  'Tokens de ativacao de conta: somente o hash e persistido; token bruto nunca e armazenado.';

commit;
