begin;

create table if not exists public.etiquetas_alunos (
  id bigint generated always as identity primary key,
  nome text not null check (btrim(nome) <> ''),
  cor text not null default '#64748b' check (cor ~ '^#[0-9A-Fa-f]{6}$'),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists etiquetas_alunos_nome_idx on public.etiquetas_alunos (lower(nome));

create table if not exists public.alunos_etiquetas (
  aluno_id uuid not null references public.alunos(id) on delete cascade,
  etiqueta_id bigint not null references public.etiquetas_alunos(id) on delete restrict,
  ator_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (aluno_id, etiqueta_id)
);
create index if not exists alunos_etiquetas_etiqueta_idx on public.alunos_etiquetas (etiqueta_id, aluno_id);

alter table public.acoes_alunos_historico drop constraint if exists acoes_alunos_historico_tipo_check;
alter table public.acoes_alunos_historico add constraint acoes_alunos_historico_tipo_check check (tipo in ('pos_venda_realizado','mensagem_manual','exportacao','etiqueta_adicionada','etiqueta_removida'));

alter table public.etiquetas_alunos enable row level security;
alter table public.alunos_etiquetas enable row level security;
revoke all on public.etiquetas_alunos, public.alunos_etiquetas from public, anon, authenticated;
grant select, insert, update, delete on public.etiquetas_alunos, public.alunos_etiquetas to service_role;
grant usage, select on sequence public.etiquetas_alunos_id_seq to service_role;

commit;
