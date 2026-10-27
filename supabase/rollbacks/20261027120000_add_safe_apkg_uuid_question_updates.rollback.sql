-- Rollback manual e explícito da migration 20261027120000.
-- Não altera questions, auditoria_administrativa, vínculos, nem comentários.
-- Execute somente depois de interromper o caminho APKG UUID na aplicação.
begin;

revoke all on function public.admin_apply_apkg_uuid_question_updates(bigint,jsonb,jsonb,uuid)
  from public, anon, authenticated, service_role;
drop function if exists public.admin_apply_apkg_uuid_question_updates(bigint,jsonb,jsonb,uuid);

commit;
