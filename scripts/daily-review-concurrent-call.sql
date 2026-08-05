\set ON_ERROR_STOP on
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
set role authenticated;
select * from public.registrar_revisao_diaria();
