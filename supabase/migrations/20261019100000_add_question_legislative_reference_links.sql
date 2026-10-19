begin;

-- Decisão editorial de destino da legislação. A origem de importação permanece
-- em legislative_references.source_question_id e nunca é substituída por este vínculo.
create table if not exists public.question_legislative_reference_links (
  question_id uuid primary key references public.questions(id) on delete cascade,
  reference_id uuid not null references public.legislative_references(id) on delete restrict,
  linked_at timestamptz not null default now(),
  linked_by uuid references auth.users(id) on delete set null
);

create index if not exists question_legislative_reference_links_reference_idx
  on public.question_legislative_reference_links (reference_id);

create or replace function public.question_legislative_reference_links_same_law()
returns trigger language plpgsql as $$
declare
  question_law_id bigint;
  reference_law_id bigint;
begin
  select lei_id into question_law_id from public.questions where id = new.question_id;
  select lei_id into reference_law_id from public.legislative_references where id = new.reference_id;
  if question_law_id is null or reference_law_id is null or question_law_id <> reference_law_id then
    raise exception 'O bloco legislativo selecionado deve pertencer à mesma legislação da questão.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists question_legislative_reference_links_same_law_trigger on public.question_legislative_reference_links;
create trigger question_legislative_reference_links_same_law_trigger
before insert or update on public.question_legislative_reference_links
for each row execute function public.question_legislative_reference_links_same_law();

alter table public.question_legislative_reference_links enable row level security;
revoke all on public.question_legislative_reference_links from public, anon, authenticated;
grant select, insert, update, delete on public.question_legislative_reference_links to service_role;

commit;
