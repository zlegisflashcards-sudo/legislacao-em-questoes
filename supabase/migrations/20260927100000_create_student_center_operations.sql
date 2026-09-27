begin;

-- A Central do Aluno guarda somente decisões operacionais manuais. Compras,
-- acessos e estudo continuam nas tabelas canônicas já existentes.
create table if not exists public.mensagens_alunos_salvas (
  id bigint generated always as identity primary key,
  nome text not null check (btrim(nome) <> ''),
  texto text not null check (btrim(texto) <> ''),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists mensagens_alunos_salvas_nome_idx on public.mensagens_alunos_salvas (lower(nome));

create table if not exists public.acoes_alunos_historico (
  id bigint generated always as identity primary key,
  aluno_id uuid not null references public.alunos(id) on delete cascade,
  ator_user_id uuid references auth.users(id) on delete set null,
  tipo text not null check (tipo in ('pos_venda_realizado','mensagem_manual','exportacao')),
  descricao text not null,
  detalhes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists acoes_alunos_historico_aluno_idx on public.acoes_alunos_historico(aluno_id, created_at desc);

insert into public.mensagens_alunos_salvas(nome,texto)
values
  ('Pós-venda — conseguiu acessar?', 'Olá, {nome}! Tudo bem? Você conseguiu acessar e utilizar {produto}? Se precisar de ajuda, estamos à disposição.'),
  ('Hotmart — lei liberada na plataforma', 'Olá, {nome}! A lei {lei}, adquirida anteriormente pela Hotmart, já está liberada na nova plataforma.')
on conflict (lower(nome)) do nothing;

alter table public.mensagens_alunos_salvas enable row level security;
alter table public.acoes_alunos_historico enable row level security;
revoke all on public.mensagens_alunos_salvas, public.acoes_alunos_historico from public, anon, authenticated;
grant select, insert, update, delete on public.mensagens_alunos_salvas, public.acoes_alunos_historico to service_role;
grant usage, select on sequence public.mensagens_alunos_salvas_id_seq, public.acoes_alunos_historico_id_seq to service_role;
commit;
