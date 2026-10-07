alter table public.article_context_mappings
  add column if not exists granularidade_legislacao text null
    check (granularidade_legislacao in ('paragrafo_inteiro', 'recorte_inciso')),
  add column if not exists granularidade_decidida_em timestamptz null;

comment on column public.article_context_mappings.granularidade_legislacao is
  'Decisão editorial para contextos por inciso: parágrafo inteiro ou recorte do inciso.';
