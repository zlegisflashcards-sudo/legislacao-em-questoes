begin;

-- Vínculo editorial opcional. A Ordem da questão nunca é alterada por esta tabela.
create table if not exists public.question_legisbot_links (
  question_id uuid primary key references public.questions(id) on delete cascade,
  legisbot_id bigint not null references public.legisbot_comentarios(id) on delete restrict,
  linked_at timestamptz not null default now(),
  linked_by uuid references auth.users(id) on delete set null
);

create index if not exists question_legisbot_links_legisbot_idx
  on public.question_legisbot_links (legisbot_id);

-- Um vínculo só pode apontar para conteúdo da mesma legislação. A Ordem pode ser
-- diferente: isso permite a vinculação explícita a um artigo superior ou correlato.
create or replace function public.question_legisbot_links_same_law()
returns trigger language plpgsql as $$
declare
  question_slug text;
  bot_slug text;
begin
  select slug into question_slug from public.questions where id = new.question_id;
  select slug into bot_slug from public.legisbot_comentarios where id = new.legisbot_id;
  if question_slug is null or bot_slug is null or lower(question_slug) <> lower(bot_slug) then
    raise exception 'O LegisBot selecionado deve pertencer à mesma legislação da questão.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists question_legisbot_links_same_law_trigger on public.question_legisbot_links;
create trigger question_legisbot_links_same_law_trigger
before insert or update on public.question_legisbot_links
for each row execute function public.question_legisbot_links_same_law();

alter table public.question_legisbot_links enable row level security;
revoke all on public.question_legisbot_links from public, anon, authenticated;
grant select, insert, update, delete on public.question_legisbot_links to service_role;

commit;
