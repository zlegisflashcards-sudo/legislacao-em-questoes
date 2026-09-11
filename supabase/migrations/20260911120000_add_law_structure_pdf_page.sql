begin;

alter table public.law_structure
  add column if not exists pdf_page integer;

alter table public.law_structure
  drop constraint if exists law_structure_pdf_page_positive;

alter table public.law_structure
  add constraint law_structure_pdf_page_positive
  check (pdf_page is null or pdf_page >= 1);

commit;
