begin;

create table if not exists public.compras_pos_venda (
  compra_id uuid primary key references public.compras(id) on delete cascade,
  etapa_5_concluida_em timestamptz,
  etapa_6_concluida_em timestamptz,
  updated_at timestamptz not null default now()
);
create table if not exists public.compras_pos_venda_historico (
  id bigint generated always as identity primary key,
  compra_id uuid not null references public.compras(id) on delete cascade,
  ator_user_id uuid references auth.users(id) on delete set null,
  etapa smallint not null check (etapa in (5,6)),
  acao text not null,
  observacao text,
  created_at timestamptz not null default now()
);
create index if not exists compras_pos_venda_historico_compra_idx on public.compras_pos_venda_historico (compra_id, created_at desc);
alter table public.compras_pos_venda enable row level security;
alter table public.compras_pos_venda_historico enable row level security;
revoke all on public.compras_pos_venda, public.compras_pos_venda_historico from public, anon, authenticated;
grant select, insert, update on public.compras_pos_venda to service_role;
grant select, insert on public.compras_pos_venda_historico to service_role;
grant usage, select on sequence public.compras_pos_venda_historico_id_seq to service_role;

commit;
