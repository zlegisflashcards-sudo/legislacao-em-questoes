alter table public.questions alter column ordem type text using ordem::text;
create index if not exists questions_law_order_text_idx on public.questions(law_id, ordem);
