begin;

create table if not exists public.admin_question_law_reviews (
  lei_id bigint primary key references public.leis(id) on delete cascade,
  reviewed_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id) on delete set null
);

alter table public.admin_question_law_reviews enable row level security;
revoke all on table public.admin_question_law_reviews from public, anon, authenticated;
grant select, insert, update, delete on table public.admin_question_law_reviews to service_role;

comment on table public.admin_question_law_reviews is
  'Marcação administrativa manual de questões conferidas no escopo de uma lei sem estrutura.';

commit;
