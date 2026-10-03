begin;

create table if not exists public.admin_question_structure_reviews (
  lei_id bigint not null references public.leis(id) on delete cascade,
  structure_id bigint not null,
  reviewed_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id) on delete set null,
  primary key (lei_id, structure_id),
  constraint admin_question_structure_reviews_structure_law_fkey
    foreign key (structure_id, lei_id) references public.law_structure(id, lei_id) on delete cascade
);

alter table public.admin_question_structure_reviews enable row level security;
revoke all on table public.admin_question_structure_reviews from public, anon, authenticated;
grant select, insert, update, delete on table public.admin_question_structure_reviews to service_role;

comment on table public.admin_question_structure_reviews is
  'Marcação administrativa manual de revisão de cada bloco de questões, isolada por lei.';

commit;
