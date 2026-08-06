\set ON_ERROR_STOP on

begin;

insert into auth.users (id,email,raw_user_meta_data) values
  ('41000001-0000-4000-8000-000000000001','admin-editorial-local@example.invalid','{"nome":"Admin editorial"}');

set local role service_role;
select pg_catalog.set_config('request.jwt.claim.role','service_role',true);

do $do$
declare
  v_admin constant uuid := '41000001-0000-4000-8000-000000000001';
  v_origin bigint; v_changed bigint; v_material bigint; v_update bigint;
  v_result jsonb; v_before_audit bigint; v_before_history bigint; v_failed boolean;
begin
  -- 1 e 2: campos legislativos e norma originaria sem alteracao.
  v_result:=public.admin_criar_lei(v_admin,'editorial-originaria','Lei editorial originaria',null,null,'EO','teste',true,1,null,'Lei nº 1/2025','2025-01-10',false,null,null,'atualizado');
  v_origin:=(v_result->>'id')::bigint;
  if v_result->>'norma_originaria_referencia'<>'Lei nº 1/2025' or (v_result->>'houve_alteracao_legislativa')::boolean then raise exception '01-02: norma originaria invalida'; end if;

  -- 3: lei com ultima alteracao incorporada.
  v_result:=public.admin_criar_lei(v_admin,'editorial-alterada','Lei editorial alterada',null,null,'EA','teste',true,2,null,'Lei nº 2/2024','2024-02-01',true,'Lei nº 9/2026','2026-08-01','atualizado');
  v_changed:=(v_result->>'id')::bigint;
  if v_result->>'ultima_alteracao_referencia'<>'Lei nº 9/2026' then raise exception '03: ultima alteracao ausente'; end if;

  -- 4: checks de coerencia.
  v_failed:=false;
  begin perform public.admin_atualizar_lei(v_admin,v_origin,'{"houve_alteracao_legislativa":true}'::jsonb); exception when check_violation then v_failed:=true; end;
  if not v_failed then raise exception '04: alteracao sem referencia aceita'; end if;

  -- 5, 6 e 7: quantidade, versao e datas do material vigente.
  v_result:=public.admin_criar_material_lei(v_admin,v_changed,'flashcards','Deck completo',null,'google_drive','https://example.invalid/deck-v1.apkg','baixar',0,true,800,'4.0','2026-07-30','2026-07-31','somente interno');
  v_material:=(v_result->>'id')::bigint;
  if (v_result->>'quantidade_itens')::integer<>800 or v_result->>'versao_material'<>'4.0' or v_result->>'revisado_em'<>'2026-07-30' or v_result->>'publicado_em'<>'2026-07-31' then raise exception '05-07: metadados do material invalidos'; end if;

  -- 8 a 13: historico, vocabularios, visibilidades e dado interno protegido.
  v_result:=public.admin_criar_atualizacao_lei(v_admin,v_changed,v_material,'melhoria_material','informativa','Revisao editorial','Resumo publico',null,null,'3.9','4.0',790,800,10,2,15,true,false,'nota privada','2026-07-31 12:00:00+00');
  v_update:=(v_result->>'id')::bigint;
  if (v_result->>'visivel_aluno')::boolean<>true or (v_result->>'visivel_catalogo')::boolean<>false then raise exception '08-12: historico ou visibilidade invalidos'; end if;
  if not exists(select 1 from public.historico_atualizacoes_leis where id=v_update and observacao_interna='nota privada') then raise exception '13: observacao interna nao persistiu'; end if;
  v_failed:=false;
  begin perform public.admin_criar_atualizacao_lei(v_admin,v_changed,null,'tipo_invalido','informativa','Invalida',null,null,null,null,null,null,null,null,null,null,true,false,null,null); exception when check_violation then v_failed:=true; end;
  if not v_failed then raise exception '09: tipo invalido aceito'; end if;
  v_failed:=false;
  begin perform public.admin_criar_atualizacao_lei(v_admin,v_changed,null,'outro','urgente','Invalida',null,null,null,null,null,null,null,null,null,null,true,false,null,null); exception when check_violation then v_failed:=true; end;
  if not v_failed then raise exception '10: importancia invalida aceita'; end if;

  -- 14 a 17: publicacao atomica atualiza material, cria historico e auditoria.
  select count(*) into v_before_audit from public.auditoria_administrativa where ator_user_id=v_admin;
  select count(*) into v_before_history from public.historico_atualizacoes_leis where lei_id=v_changed;
  v_result:=public.admin_publicar_nova_versao_material(v_admin,v_material,'https://example.invalid/deck-v2.apkg','4.1',845,'2026-08-05','2026-08-06','nova_versao_flashcards','essencial','Versao 4.1','Arquivo completo substituido','Lei nº 9/2026','2026-08-01',45,3,800,true,true,'publicacao sintetica');
  if v_result->'material'->>'versao_material'<>'4.1' or (v_result->'material'->>'quantidade_itens')::integer<>845 then raise exception '14-15: material nao foi atualizado'; end if;
  if (select count(*) from public.historico_atualizacoes_leis where lei_id=v_changed)<>v_before_history+1 then raise exception '16: historico nao foi criado'; end if;
  if (select count(*) from public.auditoria_administrativa where ator_user_id=v_admin)<=v_before_audit then raise exception '17: auditoria nao foi criada'; end if;

  -- Resumo futuro soma apenas flashcards ativos e nao contem URL/observacao.
  if not exists(select 1 from public.resumo_editorial_leis where lei_id=v_changed and quantidade_flashcards=845 and versao_material='4.1' and revisado_em='2026-08-05') then raise exception '17b: resumo editorial incorreto'; end if;

  -- 18: falha posterior ao lock/update reverte a operacao inteira.
  v_failed:=false;
  begin perform public.admin_publicar_nova_versao_material(v_admin,v_material,'https://example.invalid/nao-persistir.apkg','5.0',900,'2026-08-06','2026-08-06','tipo_invalido','essencial','Falha esperada',null,null,null,null,null,null,true,true,null); exception when check_violation then v_failed:=true; end;
  if not v_failed or exists(select 1 from public.materiais_leis where id=v_material and versao_material='5.0') then raise exception '18: rollback transacional falhou'; end if;

  -- Correcao administrativa preserva registro; ocultar nao exclui.
  perform public.admin_atualizar_atualizacao_lei(v_admin,v_update,'{"titulo":"Revisao editorial corrigida"}'::jsonb);
  perform public.admin_ocultar_atualizacao_lei(v_admin,v_update);
  if not exists(select 1 from public.historico_atualizacoes_leis where id=v_update and not visivel_aluno and not visivel_catalogo) then raise exception '18b: ocultacao excluiu ou nao ocultou'; end if;
end;
$do$;

-- 19 a 21: EXECUTE, service_role e RLS/privilegios.
do $do$
declare v_name text; v_oid oid;
begin
  foreach v_name in array array['admin_criar_atualizacao_lei','admin_atualizar_atualizacao_lei','admin_ocultar_atualizacao_lei','admin_publicar_nova_versao_material'] loop
    select p.oid into v_oid from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=v_name limit 1;
    if pg_catalog.has_function_privilege('anon',v_oid,'EXECUTE') or pg_catalog.has_function_privilege('authenticated',v_oid,'EXECUTE') then raise exception '19: cliente com EXECUTE em %',v_name; end if;
    if not pg_catalog.has_function_privilege('service_role',v_oid,'EXECUTE') then raise exception '20: service_role sem EXECUTE em %',v_name; end if;
  end loop;
  if pg_catalog.has_table_privilege('anon','public.historico_atualizacoes_leis','select') or pg_catalog.has_table_privilege('authenticated','public.historico_atualizacoes_leis','select') then raise exception '13-19: historico/observacao expostos ao cliente'; end if;
  if not (select relrowsecurity from pg_catalog.pg_class where oid='public.historico_atualizacoes_leis'::pg_catalog.regclass) then raise exception '21: RLS desabilitada'; end if;
  if exists(select 1 from pg_catalog.pg_policy where polrelid='public.historico_atualizacoes_leis'::pg_catalog.regclass) then raise exception '21: policy direta de cliente criada'; end if;
end;
$do$;

rollback;

-- 22: nenhum residuo sintetico.
do $do$
begin
  if exists(select 1 from public.leis where slug like 'editorial-%')
    or exists(select 1 from auth.users where id='41000001-0000-4000-8000-000000000001')
    or exists(select 1 from public.historico_atualizacoes_leis where titulo like 'Revisao editorial%') then
    raise exception '22: rollback deixou residuo sintetico';
  end if;
end;
$do$;

select 'law_editorial_metadata: 22 cenarios aprovados' as resultado;
