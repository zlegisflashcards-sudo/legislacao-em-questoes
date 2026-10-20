begin;

-- Inventário extraído do documento oficial integral da lei. Diferente da base
-- editorial, ele registra o que a lei contém para que a Central possa apontar
-- dispositivos que ficaram sem texto preparado ("artigos sombra").
create table if not exists public.legislative_reference_inventory (
  lei_id bigint not null references public.leis(id) on delete restrict,
  slug text not null check (btrim(slug) <> ''),
  ordem text not null check (btrim(ordem) <> ''),
  identificacao text not null check (btrim(identificacao) <> ''),
  legislacao text not null check (btrim(legislacao) <> ''),
  document_name text not null check (btrim(document_name) <> ''),
  imported_at timestamptz not null default now(),
  primary key (lei_id, ordem),
  unique (slug, ordem)
);

create index if not exists legislative_reference_inventory_lei_ordem_idx
  on public.legislative_reference_inventory (lei_id, ordem);

create or replace function public.legislative_reference_inventory_validate_law_slug()
returns trigger language plpgsql as $$
declare
  expected_law_id bigint;
begin
  new.slug = lower(btrim(new.slug));
  select id into expected_law_id from public.leis where slug = new.slug;
  if expected_law_id is null or expected_law_id <> new.lei_id then
    raise exception 'slug % não pertence à lei %', new.slug, new.lei_id using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists legislative_reference_inventory_validate_law_slug on public.legislative_reference_inventory;
create trigger legislative_reference_inventory_validate_law_slug
before insert or update on public.legislative_reference_inventory
for each row execute function public.legislative_reference_inventory_validate_law_slug();

alter table public.legislative_reference_inventory enable row level security;
revoke all on public.legislative_reference_inventory from public, anon, authenticated;
grant select, insert, update, delete on public.legislative_reference_inventory to service_role;

comment on table public.legislative_reference_inventory is
  'Inventário de dispositivos extraído da importação integral oficial para detectar lacunas na base editorial.';

commit;
