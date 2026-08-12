begin;

-- Overrides manuais são independentes das evidências automáticas e das antigas
-- colunas específicas das etapas 5 e 6.
create table if not exists public.compras_pos_venda_overrides (
  compra_id uuid not null references public.compras(id) on delete cascade,
  etapa smallint not null check (etapa between 1 and 6),
  concluida_em timestamptz not null default now(),
  ator_user_id uuid references auth.users(id) on delete set null,
  observacao text,
  updated_at timestamptz not null default now(),
  primary key (compra_id, etapa)
);

create index if not exists compras_pos_venda_overrides_compra_idx
  on public.compras_pos_venda_overrides (compra_id, etapa);

alter table public.compras_pos_venda_overrides enable row level security;
revoke all on public.compras_pos_venda_overrides from public, anon, authenticated;
grant select, insert, update, delete on public.compras_pos_venda_overrides to service_role;

alter table public.compras_pos_venda_historico
  drop constraint if exists compras_pos_venda_historico_etapa_check;
alter table public.compras_pos_venda_historico
  add constraint compras_pos_venda_historico_etapa_check check (etapa between 1 and 6);

commit;
