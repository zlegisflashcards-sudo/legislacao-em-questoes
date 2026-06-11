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

create table if not exists public.alunos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  nome text,
  email text not null,
  telefone text,
  cpf text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists alunos_email_idx
  on public.alunos (lower(trim(email)));

create or replace function public.set_atualizado_em()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

drop trigger if exists set_alunos_atualizado_em on public.alunos;
create trigger set_alunos_atualizado_em
  before update on public.alunos
  for each row
  execute function public.set_atualizado_em();

create or replace function public.criar_aluno_para_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.alunos (user_id, nome, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nome', new.raw_user_meta_data->>'name'),
    new.email
  )
  on conflict (user_id) do update
    set
      nome = coalesce(public.alunos.nome, excluded.nome),
      email = excluded.email;

  return new;
end;
$$;

drop trigger if exists criar_aluno_apos_cadastro on auth.users;
create trigger criar_aluno_apos_cadastro
  after insert on auth.users
  for each row
  execute function public.criar_aluno_para_usuario();

alter table public.alunos enable row level security;

drop policy if exists "Aluno pode ler o proprio perfil" on public.alunos;
create policy "Aluno pode ler o proprio perfil"
  on public.alunos
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Aluno pode criar o proprio perfil" on public.alunos;
create policy "Aluno pode criar o proprio perfil"
  on public.alunos
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Aluno pode atualizar o proprio perfil" on public.alunos;
create policy "Aluno pode atualizar o proprio perfil"
  on public.alunos
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
