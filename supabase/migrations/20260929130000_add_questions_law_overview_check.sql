begin;

alter table public.admin_law_overview_checks
  drop constraint if exists admin_law_overview_checks_item_check;

alter table public.admin_law_overview_checks
  add constraint admin_law_overview_checks_item_check
  check (item in ('estrutura', 'materiais', 'legiscast', 'anki', 'questoes'));

commit;
