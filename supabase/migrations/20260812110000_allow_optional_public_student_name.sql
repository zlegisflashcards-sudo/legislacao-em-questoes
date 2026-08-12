begin;

alter table public.perfis_publicos alter column nome_publico drop not null;
alter table public.perfis_publicos drop constraint if exists perfis_publicos_nome_tamanho;
alter table public.perfis_publicos drop constraint if exists perfis_publicos_nome_formato;
alter table public.perfis_publicos add constraint perfis_publicos_nome_tamanho check (
  nome_publico is null or char_length(btrim(nome_publico)) between 3 and 50
);
alter table public.perfis_publicos add constraint perfis_publicos_nome_formato check (
  nome_publico is null or (nome_publico !~ '[<>[:cntrl:]]' and nome_publico !~* '(https?://|www\.)')
);

commit;
