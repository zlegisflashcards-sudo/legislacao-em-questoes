\set ON_ERROR_STOP on

create extension if not exists dblink;
select dblink_connect('legisbot_c1', 'dbname=legisbot_test user=postgres');
select dblink_connect('legisbot_c2', 'dbname=legisbot_test user=postgres');

select dblink_send_query('legisbot_c1', $$
  select decisao from public.reservar_geracao_legisbot(
    '40000000-0000-4000-8000-000000000004', 'TESTCONCURRENT', '1', 'Lei', 'Artigo', 'Texto legal'
  )
$$);
select dblink_send_query('legisbot_c2', $$
  select decisao from public.reservar_geracao_legisbot(
    '40000000-0000-4000-8000-000000000004', 'TESTCONCURRENT', '1', 'Lei', 'Artigo', 'Texto legal'
  )
$$);

select decisao from dblink_get_result('legisbot_c1') as result(decisao text);
select decisao from dblink_get_result('legisbot_c2') as result(decisao text);
select dblink_disconnect('legisbot_c1');
select dblink_disconnect('legisbot_c2');
drop extension dblink;
