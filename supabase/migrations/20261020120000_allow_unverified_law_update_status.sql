begin;

-- "Não verificado" é diferente da conferência administrativa: registra que
-- ainda não houve auditoria de atualização legislativa. Nenhum registro é
-- alterado por esta migration.
alter table public.leis drop constraint if exists leis_situacao_atualizacao_check;
alter table public.leis add constraint leis_situacao_atualizacao_check
  check (situacao_atualizacao in ('nao_verificado', 'atualizado', 'desatualizado'));

-- Novos placeholders não devem alegar atualização sem verificação.
alter table public.leis
  alter column situacao_atualizacao set default 'nao_verificado';

comment on column public.leis.situacao_atualizacao is 'Estado da atualização legislativa: não verificado, atualizado ou desatualizado. Independente da situação administrativa de conferência.';

commit;
