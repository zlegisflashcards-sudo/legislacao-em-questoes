begin;

alter table public.leis
  add column if not exists tipo_conteudo text not null default 'legislacao';

alter table public.leis
  drop constraint if exists leis_tipo_conteudo_check;

alter table public.leis
  add constraint leis_tipo_conteudo_check
  check (tipo_conteudo in ('legislacao', 'doutrina'));

comment on column public.leis.tipo_conteudo is
  'Classifica o conteúdo cadastrado como legislação ou doutrina.';

commit;
