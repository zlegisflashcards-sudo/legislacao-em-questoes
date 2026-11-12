-- A inativação é visual. O motivo editorial permanece no corpo do bloco,
-- portanto não há uma lei revogadora obrigatória para marcar o dispositivo.
alter table public.legislative_references
  drop constraint if exists legislative_references_revogacao_check;

alter table public.legislative_references
  add constraint legislative_references_revogacao_check
  check (situacao in ('pendente', 'preparada', 'revogada', 'arquivada'));
