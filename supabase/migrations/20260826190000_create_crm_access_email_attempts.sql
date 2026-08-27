create table if not exists public.crm_access_email_attempts (
  id uuid primary key default gen_random_uuid(),
  compra_id uuid not null references public.compras(id) on delete cascade,
  aluno_id uuid not null references public.alunos(id) on delete restrict,
  idempotency_key text not null,
  destinatario text not null,
  tipo_acesso text not null check (tipo_acesso in ('existing_account','first_access')),
  template text not null,
  assunto text not null,
  html_snapshot text not null,
  text_snapshot text not null,
  botao_texto text not null,
  destino_botao text not null,
  status text not null check (status in ('reserved','sent','failed')),
  resend_message_id text,
  erro text,
  criado_em timestamptz not null default now(),
  enviado_em timestamptz
);

create index if not exists crm_access_email_attempts_compra_criado_idx on public.crm_access_email_attempts (compra_id, criado_em desc);
alter table public.crm_access_email_attempts enable row level security;
revoke all on table public.crm_access_email_attempts from public, anon, authenticated;
