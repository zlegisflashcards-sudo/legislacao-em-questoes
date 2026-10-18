begin;

-- A referência continua sendo a mesma identidade editorial (lei + ordem).
-- O estado de revogação não apaga texto, UUID, nem vínculos já existentes.
alter table public.legislative_references
  add column if not exists situacao text not null default 'pendente',
  add column if not exists lei_revogadora text,
  add column if not exists revogado_em timestamptz;

alter table public.legislative_references
  drop constraint if exists legislative_references_situacao_check;
alter table public.legislative_references
  add constraint legislative_references_situacao_check
  check (situacao in ('pendente', 'preparada', 'revogada'));

alter table public.legislative_references
  drop constraint if exists legislative_references_revogacao_check;
alter table public.legislative_references
  add constraint legislative_references_revogacao_check
  check (
    (situacao = 'revogada' and nullif(btrim(coalesce(lei_revogadora, '')), '') is not null)
    or situacao <> 'revogada'
  );

-- Migração incremental: nunca substitui legislação já preparada.
update public.legislative_references
set situacao = case when nullif(btrim(coalesce(legislacao, '')), '') is not null then 'preparada' else 'pendente' end
where situacao = 'pendente';

create index if not exists legislative_references_preview_idx
  on public.legislative_references (lei_id, ordem, situacao);

commit;
