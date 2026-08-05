\set ON_ERROR_STOP on

create or replace function public.test_assert(condition boolean, message text)
returns void
language plpgsql
as $$
begin
  if not coalesce(condition, false) then
    raise exception 'assertion failed: %', message;
  end if;
end;
$$;
grant execute on function public.test_assert(boolean, text) to authenticated;

insert into auth.users (id) values
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222')
on conflict do nothing;

select public.test_assert(
  not has_table_privilege('anon', 'public.registros_revisao_diaria', 'select'),
  'anon must not read the table'
);
select public.test_assert(
  not has_table_privilege('anon', 'public.registros_revisao_diaria', 'insert'),
  'anon must not write the table'
);
select public.test_assert(
  has_table_privilege('authenticated', 'public.registros_revisao_diaria', 'select'),
  'authenticated must read through RLS'
);
select public.test_assert(
  not has_table_privilege('authenticated', 'public.registros_revisao_diaria', 'insert'),
  'authenticated must not insert directly'
);
select public.test_assert(
  has_table_privilege('service_role', 'public.registros_revisao_diaria', 'insert,select,update,delete'),
  'service_role privileges must be preserved'
);
select public.test_assert(
  (select relrowsecurity from pg_class where oid = 'public.registros_revisao_diaria'::regclass),
  'RLS must be enabled'
);
select public.test_assert(
  (select count(*) = 1 from pg_policies where schemaname = 'public' and tablename = 'registros_revisao_diaria' and policyname = 'registros_revisao_diaria_ler_proprios'),
  'own-row select policy must exist once'
);
select public.test_assert(
  has_function_privilege('authenticated', 'public.registrar_revisao_diaria()', 'execute'),
  'authenticated must execute the registration RPC'
);
select public.test_assert(
  not has_function_privilege('anon', 'public.registrar_revisao_diaria()', 'execute'),
  'anon must not execute the registration RPC'
);
select public.test_assert(
  not has_function_privilege('authenticated', 'public.calcular_streak_revisao(uuid,date)', 'execute'),
  'authenticated must not execute the helper directly'
);
select public.test_assert(
  has_function_privilege('service_role', 'public.calcular_streak_revisao(uuid,date)', 'execute'),
  'service_role must execute the helper'
);
select public.test_assert(
  pg_get_function_arguments('public.registrar_revisao_diaria()'::regprocedure) = '',
  'registration RPC must not accept user or date arguments'
);

truncate public.registros_revisao_diaria;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
set role authenticated;
select public.test_assert(
  (select data_revisao is null and not hoje_concluida and streak_atual = 0 from public.obter_sequencia_revisao()),
  'a user without records must have streak zero and today incomplete'
);
select public.test_assert(
  (select data_revisao = (clock_timestamp() at time zone 'America/Sao_Paulo')::date and hoje_concluida and streak_atual = 1 from public.registrar_revisao_diaria()),
  'first registration must create today with streak one'
);
select public.test_assert(
  (select data_revisao = (clock_timestamp() at time zone 'America/Sao_Paulo')::date and hoje_concluida and streak_atual = 1 from public.registrar_revisao_diaria()),
  'same-day registration must keep streak unchanged'
);
reset role;

select public.test_assert(
  (select count(*) = 1 from public.registros_revisao_diaria where user_id = '11111111-1111-4111-8111-111111111111' and data_revisao = (clock_timestamp() at time zone 'America/Sao_Paulo')::date),
  'same-day registration must be idempotent'
);

truncate public.registros_revisao_diaria;
insert into public.registros_revisao_diaria (user_id, data_revisao) values
  ('11111111-1111-4111-8111-111111111111', (clock_timestamp() at time zone 'America/Sao_Paulo')::date - 2),
  ('11111111-1111-4111-8111-111111111111', (clock_timestamp() at time zone 'America/Sao_Paulo')::date - 1),
  ('22222222-2222-4222-8222-222222222222', (clock_timestamp() at time zone 'America/Sao_Paulo')::date);
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
set role authenticated;
select public.test_assert((select count(*) = 2 from public.registros_revisao_diaria), 'RLS must hide the other user row');
select public.registrar_revisao_diaria();
reset role;
select public.test_assert(
  public.calcular_streak_revisao('11111111-1111-4111-8111-111111111111', (clock_timestamp() at time zone 'America/Sao_Paulo')::date) = 3,
  'consecutive days must increase streak'
);

delete from public.registros_revisao_diaria where user_id = '11111111-1111-4111-8111-111111111111';
insert into public.registros_revisao_diaria (user_id, data_revisao) values
  ('11111111-1111-4111-8111-111111111111', (clock_timestamp() at time zone 'America/Sao_Paulo')::date - 1);
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
set role authenticated;
select public.test_assert(
  (select data_revisao is null and not hoje_concluida and streak_atual = 1 from public.obter_sequencia_revisao()),
  'yesterday without today must preserve current streak and report today incomplete'
);
reset role;

delete from public.registros_revisao_diaria where user_id = '11111111-1111-4111-8111-111111111111';
insert into public.registros_revisao_diaria (user_id, data_revisao) values
  ('11111111-1111-4111-8111-111111111111', (clock_timestamp() at time zone 'America/Sao_Paulo')::date - 3);
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
set role authenticated;
select public.registrar_revisao_diaria();
reset role;
select public.test_assert(
  public.calcular_streak_revisao('11111111-1111-4111-8111-111111111111', (clock_timestamp() at time zone 'America/Sao_Paulo')::date) = 1,
  'a gap must restart streak at one'
);
select public.test_assert(
  (select data_revisao = (clock_timestamp() at time zone 'America/Sao_Paulo')::date and hoje_concluida and streak_atual = 1 from public.obter_sequencia_revisao()),
  'read RPC must use Sao Paulo local date and persisted streak'
);

select public.test_assert(
  (timestamp with time zone '2026-08-05 02:59:59+00' at time zone 'America/Sao_Paulo')::date = date '2026-08-04',
  'Sao Paulo date must remain on the prior day immediately before 03:00 UTC'
);
select public.test_assert(
  (timestamp with time zone '2026-08-05 03:00:00+00' at time zone 'America/Sao_Paulo')::date = date '2026-08-05',
  'Sao Paulo date must advance at 03:00 UTC'
);

truncate public.registros_revisao_diaria;
drop function public.test_assert(boolean, text);
delete from auth.users
where id in (
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222'
);
