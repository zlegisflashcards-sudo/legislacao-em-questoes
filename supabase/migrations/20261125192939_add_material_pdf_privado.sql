create table if not exists public.materiais_pdf_privados (
  material_id bigint primary key references public.materiais_leis(id) on delete cascade,
  conteudo_base64 text not null check (char_length(conteudo_base64) between 16 and 6990508),
  criado_em timestamptz not null default now()
);
alter table public.materiais_pdf_privados enable row level security;
revoke all on table public.materiais_pdf_privados from public, anon, authenticated;
grant select,insert,update on table public.materiais_pdf_privados to service_role;
