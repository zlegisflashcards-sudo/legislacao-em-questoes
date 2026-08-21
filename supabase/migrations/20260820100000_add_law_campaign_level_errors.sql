begin;

alter table public.campanhas_leis_niveis
  add column if not exists total_erros integer not null default 0 check (total_erros >= 0);

comment on column public.campanhas_leis_niveis.total_erros is 'Total de erros do nível, inclusive reapresentações durante a revisão.';

commit;
