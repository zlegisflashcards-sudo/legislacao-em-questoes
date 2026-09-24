begin;

create table if not exists public.admin_law_overview_checks (
  lei_id bigint not null references public.leis(id) on delete cascade,
  item text not null,
  completed_at timestamptz not null default now(),
  completed_by uuid references auth.users(id) on delete set null,
  primary key (lei_id, item),
  constraint admin_law_overview_checks_item_check check (item in ('estrutura', 'materiais', 'legiscast', 'anki'))
);

alter table public.admin_law_overview_checks enable row level security;
revoke all on table public.admin_law_overview_checks from public, anon, authenticated;
grant select, insert, update, delete on table public.admin_law_overview_checks to service_role;

comment on table public.admin_law_overview_checks is
  'Checklist interno e administrativo da Central da Lei. Nao altera publicacao, acesso ou estado editorial.';

commit;
