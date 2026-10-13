begin;

create table if not exists public.admin_question_conference_lists (
  id uuid primary key default gen_random_uuid(),
  lei_id bigint not null references public.leis(id) on delete cascade,
  nome text not null check (char_length(btrim(nome)) between 1 and 160),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_question_conference_list_items (
  list_id uuid not null references public.admin_question_conference_lists(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  position integer not null check (position > 0),
  created_at timestamptz not null default now(),
  primary key (list_id, question_id),
  unique (list_id, position)
);

create table if not exists public.admin_question_conference_list_progress (
  list_id uuid not null,
  question_id uuid not null,
  reviewed_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id) on delete set null,
  primary key (list_id, question_id),
  foreign key (list_id, question_id) references public.admin_question_conference_list_items(list_id, question_id) on delete cascade
);

create index if not exists admin_question_conference_lists_law_idx on public.admin_question_conference_lists(lei_id, updated_at desc);
create index if not exists admin_question_conference_list_items_question_idx on public.admin_question_conference_list_items(question_id);

drop trigger if exists admin_question_conference_lists_updated_at on public.admin_question_conference_lists;
create trigger admin_question_conference_lists_updated_at before update on public.admin_question_conference_lists
  for each row execute function public.definir_updated_at();

alter table public.admin_question_conference_lists enable row level security;
alter table public.admin_question_conference_list_items enable row level security;
alter table public.admin_question_conference_list_progress enable row level security;
revoke all on table public.admin_question_conference_lists, public.admin_question_conference_list_items, public.admin_question_conference_list_progress from public, anon, authenticated;
grant select, insert, update, delete on public.admin_question_conference_lists, public.admin_question_conference_list_items, public.admin_question_conference_list_progress to service_role;

comment on table public.admin_question_conference_lists is 'Listas administrativas persistentes de UUIDs para o Conferidor de Questões.';
comment on table public.admin_question_conference_list_progress is 'Progresso administrativo isolado por lista personalizada e questão.';

commit;
