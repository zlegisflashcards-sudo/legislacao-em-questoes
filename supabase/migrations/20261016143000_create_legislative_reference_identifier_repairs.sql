begin;

-- Immutable before/after evidence for the conservative Art./§ repair.
-- The reference itself is updated in place: UUID, Ordem, links and formatting remain intact.
create table if not exists public.legislative_reference_identifier_repairs (
  id uuid primary key default gen_random_uuid(),
  reference_id uuid not null references public.legislative_references(id) on delete restrict,
  lei_id bigint not null references public.leis(id) on delete restrict,
  slug text not null,
  ordem text not null,
  identificacao text not null,
  legislacao_anterior text not null,
  legislacao_reparada text not null,
  repaired_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint legislative_reference_identifier_repairs_one_per_reference unique (reference_id)
);

create index if not exists legislative_reference_identifier_repairs_law_idx
  on public.legislative_reference_identifier_repairs (lei_id, ordem);

alter table public.legislative_reference_identifier_repairs enable row level security;
revoke all on public.legislative_reference_identifier_repairs from public, anon, authenticated;
grant select, insert on public.legislative_reference_identifier_repairs to service_role;

commit;
