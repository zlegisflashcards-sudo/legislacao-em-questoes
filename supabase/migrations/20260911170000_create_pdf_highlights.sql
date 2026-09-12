begin;

create table if not exists public.pdf_highlights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  material_id bigint not null references public.materiais_leis(id) on delete cascade,
  page integer not null check (page >= 1),
  selected_text text not null check (btrim(selected_text) <> ''),
  anchor_data jsonb not null check (jsonb_typeof(anchor_data) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists pdf_highlights_user_material_page_idx
  on public.pdf_highlights (user_id, material_id, page, created_at);

alter table public.pdf_highlights enable row level security;
revoke all on table public.pdf_highlights from public, anon;
grant select, insert, delete on table public.pdf_highlights to authenticated;

create policy pdf_highlights_select_own on public.pdf_highlights
  for select to authenticated using (user_id = auth.uid());
create policy pdf_highlights_insert_own on public.pdf_highlights
  for insert to authenticated with check (user_id = auth.uid());
create policy pdf_highlights_delete_own on public.pdf_highlights
  for delete to authenticated using (user_id = auth.uid());

commit;
