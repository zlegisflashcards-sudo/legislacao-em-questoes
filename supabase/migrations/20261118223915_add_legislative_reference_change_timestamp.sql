-- Registra somente a alteração do conteúdo legal. Identificação, ordem e
-- metadados não tornam um áudio desatualizado.
alter table public.legislative_references
  add column if not exists legislacao_atualizada_em timestamptz;

comment on column public.legislative_references.legislacao_atualizada_em is
  'Instante da última alteração efetiva do texto legislativo do bloco; usado para sinalizar áudio anterior como desatualizado.';

create index if not exists legislative_references_legislacao_atualizada_idx
  on public.legislative_references (lei_id, structure_id, legislacao_atualizada_em desc)
  where legislacao_atualizada_em is not null;
