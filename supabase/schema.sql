create extension if not exists pgcrypto;

create table if not exists public.atualizacoes_email (
  id uuid primary key default gen_random_uuid(),
  legislacao_codigo text not null,
  legislacao_nome text not null,
  nome text,
  email text not null,
  created_at timestamptz not null default now()
);

alter table public.atualizacoes_email
  add column if not exists nome text;

create table if not exists public.reportes_alteracao (
  id uuid primary key default gen_random_uuid(),
  legislacao_codigo text not null,
  legislacao_nome text not null,
  email text,
  descricao text not null,
  status text not null default 'pendente',
  created_at timestamptz not null default now(),
  constraint reportes_alteracao_status_check check (
    status in ('pendente', 'em_analise', 'resolvido', 'arquivado')
  )
);

create table if not exists public.comentarios (
  id uuid primary key default gen_random_uuid(),
  legislacao_codigo text not null,
  legislacao_nome text not null,
  nome text not null,
  email text,
  comentario text not null,
  aprovado boolean not null default false,
  created_at timestamptz not null default now(),
  approved_at timestamptz
);

create index if not exists atualizacoes_email_legislacao_idx
  on public.atualizacoes_email (legislacao_codigo);

delete from public.atualizacoes_email
where id in (
  select id
  from (
    select
      id,
      row_number() over (
        partition by legislacao_codigo, lower(trim(email))
        order by created_at asc
      ) as row_number
    from public.atualizacoes_email
  ) duplicados
  where duplicados.row_number > 1
);

create unique index if not exists atualizacoes_email_legislacao_email_unique_idx
  on public.atualizacoes_email (legislacao_codigo, lower(trim(email)));

create index if not exists reportes_alteracao_legislacao_idx
  on public.reportes_alteracao (legislacao_codigo);

create index if not exists comentarios_legislacao_aprovado_idx
  on public.comentarios (legislacao_codigo, aprovado);

alter table public.atualizacoes_email enable row level security;
alter table public.reportes_alteracao enable row level security;
alter table public.comentarios enable row level security;

drop policy if exists "Permitir cadastro publico de emails" on public.atualizacoes_email;
create policy "Permitir cadastro publico de emails"
  on public.atualizacoes_email
  for insert
  to anon
  with check (true);

drop policy if exists "Permitir reporte publico de alteracao" on public.reportes_alteracao;
create policy "Permitir reporte publico de alteracao"
  on public.reportes_alteracao
  for insert
  to anon
  with check (true);

drop policy if exists "Permitir envio publico de comentarios" on public.comentarios;
create policy "Permitir envio publico de comentarios"
  on public.comentarios
  for insert
  to anon
  with check (aprovado = false);

drop policy if exists "Permitir leitura publica de comentarios aprovados" on public.comentarios;
create policy "Permitir leitura publica de comentarios aprovados"
  on public.comentarios
  for select
  to anon
  using (aprovado = true);
