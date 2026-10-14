begin;

-- Fonte editorial persistente da Central do Artigo. A legislação preenchida
-- permanece independente do recorte usado pelas questões.
create table if not exists public.legislative_references (
  id uuid primary key default gen_random_uuid(),
  lei_id bigint not null references public.leis(id) on delete restrict,
  slug text not null check (btrim(slug) <> ''),
  ordem text not null check (btrim(ordem) <> ''),
  identificacao text not null check (btrim(identificacao) <> ''),
  legislacao text,
  source_question_id uuid references public.questions(id) on delete set null,
  preparado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lei_id, ordem),
  unique (slug, ordem)
);

create index if not exists legislative_references_lei_ordem_idx
  on public.legislative_references (lei_id, ordem);
create index if not exists legislative_references_slug_ordem_idx
  on public.legislative_references (slug, ordem);
create index if not exists legislative_references_unprepared_idx
  on public.legislative_references (lei_id, ordem) where legislacao is null;

-- Impede que uma referência ligue Ordem de uma lei a um slug de outra. O slug
-- é normalizado uma vez no banco, antes da verificação das duas unicidades.
create or replace function public.legislative_references_validate_law_slug()
returns trigger language plpgsql as $$
declare
  expected_law_id bigint;
begin
  new.slug = lower(btrim(new.slug));
  select id into expected_law_id from public.leis where slug = new.slug;
  if expected_law_id is null or expected_law_id <> new.lei_id then
    raise exception 'slug % não pertence à lei %', new.slug, new.lei_id
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists legislative_references_validate_law_slug on public.legislative_references;
create trigger legislative_references_validate_law_slug
before insert or update on public.legislative_references
for each row execute function public.legislative_references_validate_law_slug();

create or replace function public.legislative_references_set_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;

drop trigger if exists legislative_references_set_updated_at on public.legislative_references;
create trigger legislative_references_set_updated_at
before update on public.legislative_references
for each row execute function public.legislative_references_set_updated_at();

alter table public.legislative_references enable row level security;
revoke all on public.legislative_references from public, anon, authenticated;
grant select, insert, update, delete on public.legislative_references to service_role;

commit;
