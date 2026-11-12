begin;

-- Estado editorial separado da publicação global da lei. A ausência da linha
-- significa "pendente"; nunca cria liberação automática.
create table public.legislative_structure_releases (
  structure_id bigint primary key,
  lei_id bigint not null,
  status text not null check (status in ('released', 'blocked')),
  released_at timestamptz,
  released_by uuid references auth.users(id) on delete set null,
  blocked_at timestamptz,
  blocked_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint legislative_structure_releases_same_law_fkey
    foreign key (structure_id, lei_id)
    references public.law_structure (id, lei_id)
    on update restrict
    on delete cascade,
  constraint legislative_structure_releases_state_check check (
    (status = 'released' and released_at is not null)
    or (status = 'blocked' and blocked_at is not null)
  )
);

create index legislative_structure_releases_lei_status_idx
  on public.legislative_structure_releases (lei_id, status, structure_id);

alter table public.legislative_structure_releases enable row level security;
revoke all on table public.legislative_structure_releases from anon, authenticated;
grant select, insert, update, delete on table public.legislative_structure_releases to service_role;

commit;

-- Rollback manual, somente se esta ainda for a última migration aplicada:
-- begin;
-- drop table if exists public.legislative_structure_releases;
-- commit;
