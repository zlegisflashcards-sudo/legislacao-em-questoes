begin;

-- Dependencia minima da RPC admin_mesclar_alunos. Esta migration e independente
-- para ambientes cujo historico remoto nao registrou a migration de identidade.
create or replace function public.normalizar_email_aluno(p_email text)
returns text
language sql
immutable
strict
set search_path = pg_catalog
as $$ select pg_catalog.lower(pg_catalog.btrim(p_email)) $$;

revoke all on function public.normalizar_email_aluno(text) from public, anon, authenticated;

commit;
