begin;

-- Dados comerciais e de acesso continuam nas tabelas existentes. Esta camada
-- guarda somente decisões e registros manuais do atendimento pós-venda.
create table if not exists public.alunos_pos_venda (
  aluno_id uuid primary key references public.alunos(id) on delete cascade,
  whatsapp_enviado_em timestamptz,
  uso_questoes_status text not null default 'nao_confirmado'
    check (uso_questoes_status in ('nao_confirmado','conseguiu_utilizar','precisa_ajuda','problema_resolvido')),
  uso_questoes_atualizado_em timestamptz,
  suporte_inicial_concluido_em timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.alunos_pos_venda_historico (
  id bigint generated always as identity primary key,
  aluno_id uuid not null references public.alunos(id) on delete cascade,
  ator_user_id uuid references auth.users(id) on delete set null,
  acao text not null,
  status text,
  observacao text,
  created_at timestamptz not null default now()
);
create index if not exists alunos_pos_venda_historico_aluno_created_idx on public.alunos_pos_venda_historico (aluno_id, created_at desc);

alter table public.alunos_pos_venda enable row level security;
alter table public.alunos_pos_venda_historico enable row level security;
revoke all on public.alunos_pos_venda, public.alunos_pos_venda_historico from public, anon, authenticated;
grant select, insert, update on public.alunos_pos_venda to service_role;
grant select, insert on public.alunos_pos_venda_historico to service_role;
grant usage, select on sequence public.alunos_pos_venda_historico_id_seq to service_role;

commit;
