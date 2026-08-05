\set ON_ERROR_STOP on

begin;

create trigger teste_rpcs_criar_aluno
  after insert on auth.users
  for each row execute function public.criar_aluno_para_usuario();

insert into auth.users (id,email,raw_user_meta_data) values
  ('31000001-0000-4000-8000-000000000001','admin-rpc-local@example.invalid','{"nome":"Admin RPC"}'),
  ('32000002-0000-4000-8000-000000000002','aluno-rpc-local@example.invalid','{"nome":"Aluno RPC"}');

set local role service_role;
select pg_catalog.set_config('request.jwt.claim.role','service_role',true);

do $do$
declare
  v_admin constant uuid := '31000001-0000-4000-8000-000000000001';
  v_student uuid;
  v_law_a bigint; v_law_b bigint; v_law_c bigint;
  v_material bigint; v_product uuid; v_purchase uuid; v_release bigint;
  v_result jsonb; v_before integer; v_failed boolean;
begin
  select id into v_student from public.alunos where user_id='32000002-0000-4000-8000-000000000002';
  if v_student is null then raise exception '01: aluno sintetico nao foi criado'; end if;

  v_result:=public.admin_criar_lei(v_admin,'rpc-lei-a','RPC Lei A','Lei A','descricao','A','teste',true,1,null);
  v_law_a:=(v_result->>'id')::bigint;
  v_law_b:=(public.admin_criar_lei(v_admin,'rpc-lei-b','RPC Lei B',null,null,null,'teste',true,2,null)->>'id')::bigint;
  v_law_c:=(public.admin_criar_lei(v_admin,'rpc-lei-c','RPC Lei C',null,null,null,'teste',true,3,null)->>'id')::bigint;
  if (public.admin_atualizar_lei(v_admin,v_law_a,'{"nome_curto":"Lei A editada"}'::jsonb)->>'nome_curto')<>'Lei A editada' then raise exception '02: edicao de lei falhou'; end if;

  v_result:=public.admin_criar_material_lei(v_admin,v_law_a,'pdf','Material RPC',null,'externo','https://example.invalid/material','abrir',0,true);
  v_material:=(v_result->>'id')::bigint;
  if (public.admin_atualizar_material_lei(v_admin,v_material,'{"titulo":"Material RPC editado"}'::jsonb)->>'titulo')<>'Material RPC editado' then raise exception '03: edicao de material falhou'; end if;

  v_result:=public.admin_criar_produto(v_admin,'Produto RPC','produto-rpc','Produto local','combo',null,null,0,true,'sintetico');
  v_product:=(v_result->>'id')::uuid;
  if (public.admin_atualizar_produto(v_admin,v_product,'{"nome":"Produto RPC editado"}'::jsonb)->>'nome')<>'Produto RPC editado' then raise exception '04: edicao de produto falhou'; end if;
  perform public.admin_definir_leis_produto(v_admin,v_product,array[v_law_a,v_law_b]);
  if (select count(*) from public.produto_leis where produto_id=v_product)<>2 then raise exception '05: composicao atomica falhou'; end if;

  v_failed:=false;
  begin perform public.admin_definir_leis_produto(v_admin,v_product,array[v_law_a,v_law_a]); exception when sqlstate '22023' then v_failed:=true; end;
  if not v_failed or (select count(*) from public.produto_leis where produto_id=v_product)<>2 then raise exception '06: duplicidade na composicao foi aceita'; end if;

  v_failed:=false;
  begin perform public.admin_definir_leis_produto(v_admin,v_product,array[v_law_a,999999999]); exception when sqlstate '22023' then v_failed:=true; end;
  if not v_failed or (select count(*) from public.produto_leis where produto_id=v_product)<>2 then raise exception '06b: composicao invalida nao foi atomica'; end if;

  v_result:=public.admin_registrar_aquisicao(v_admin,v_student,v_product,'administrativo','rpc-aquisicao-1','sintetico');
  v_purchase:=(v_result->'compra'->>'id')::uuid;
  if (v_result->>'liberacoes_criadas')::integer<>2 then raise exception '07: snapshot da composicao falhou'; end if;
  if (select count(*) from public.acessos_efetivos_leis where aluno_id=v_student)<>2 then raise exception '08: acesso efetivo inicial falhou'; end if;

  v_failed:=false;
  begin perform public.admin_registrar_aquisicao(v_admin,v_student,v_product,'administrativo','rpc-aquisicao-1','duplicada'); exception when unique_violation then v_failed:=true; end;
  if not v_failed then raise exception '09: identificador externo duplicado foi aceito'; end if;

  perform public.admin_definir_leis_produto(v_admin,v_product,array[v_law_a,v_law_b,v_law_c]);
  perform public.admin_cancelar_aquisicao(v_admin,v_purchase);
  if exists(select 1 from public.liberacoes_leis where compra_id=v_purchase and status<>'cancelado') then raise exception '10: cancelamento nao propagou'; end if;
  perform public.admin_reativar_aquisicao(v_admin,v_purchase);
  if (select count(*) from public.liberacoes_leis where compra_id=v_purchase and status='ativo')<>2 then raise exception '11: reativacao criou direito retroativo'; end if;
  if exists(select 1 from public.liberacoes_leis where compra_id=v_purchase and lei_id=v_law_c) then raise exception '12: lei nova foi liberada retroativamente'; end if;
  perform public.admin_reembolsar_aquisicao(v_admin,v_purchase);
  if exists(select 1 from public.liberacoes_leis where compra_id=v_purchase and status<>'reembolsado') then raise exception '13: reembolso nao propagou'; end if;
  perform public.admin_reativar_aquisicao(v_admin,v_purchase);

  v_result:=public.admin_conceder_lei_manual(v_admin,v_student,v_law_a,'cortesia','segunda fonte');
  v_release:=(v_result->>'id')::bigint;
  perform public.admin_revogar_liberacao(v_admin,v_release,'fim da cortesia');
  if not exists(select 1 from public.acessos_efetivos_leis where aluno_id=v_student and lei_id=v_law_a) then raise exception '14: revogar uma fonte removeu outra fonte ativa'; end if;

  v_failed:=false;
  begin perform public.admin_conceder_lei_manual(v_admin,v_student,v_law_b,'hotmart','origem proibida'); exception when sqlstate '22023' then v_failed:=true; end;
  if not v_failed then raise exception '15: concessao manual Hotmart foi aceita'; end if;

  select count(*) into v_before from public.auditoria_administrativa where ator_user_id=v_admin;
  if v_before<15 then raise exception '16: trilha de auditoria incompleta: %',v_before; end if;
  if not exists(select 1 from public.auditoria_administrativa where ator_user_id=v_admin and estado_anterior is not null and estado_posterior is not null) then raise exception '17: auditoria nao preservou antes/depois'; end if;
  if not exists(select 1 from public.compras where id=v_purchase) or not exists(select 1 from public.liberacoes_leis where compra_id=v_purchase) then raise exception '18: historico foi excluido'; end if;
end;
$do$;

do $do$
declare v_name text; v_oid oid;
begin
  foreach v_name in array array[
    'admin_criar_lei','admin_atualizar_lei','admin_criar_material_lei','admin_atualizar_material_lei',
    'admin_criar_produto','admin_atualizar_produto','admin_definir_leis_produto','admin_registrar_aquisicao',
    'admin_cancelar_aquisicao','admin_reembolsar_aquisicao','admin_reativar_aquisicao',
    'admin_conceder_lei_manual','admin_revogar_liberacao'
  ] loop
    select p.oid into v_oid from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname=v_name limit 1;
    if v_oid is null then raise exception '19: funcao ausente: %',v_name; end if;
    if pg_catalog.has_function_privilege('anon',v_oid,'EXECUTE') or pg_catalog.has_function_privilege('authenticated',v_oid,'EXECUTE') then
      raise exception '19: cliente possui EXECUTE em %',v_name;
    end if;
    if not pg_catalog.has_function_privilege('service_role',v_oid,'EXECUTE') then raise exception '20: service_role sem EXECUTE em %',v_name; end if;
  end loop;
end;
$do$;

reset role;
select pg_catalog.set_config('request.jwt.claim.role','',true);

do $do$
declare v_failed boolean:=false;
begin
  begin perform public.admin_criar_lei('31000001-0000-4000-8000-000000000001','rpc-sem-role','Sem role',null,null,null,null,true,0,null);
  exception when insufficient_privilege then v_failed:=true; end;
  if not v_failed then raise exception '21: chamada sem service_role foi aceita'; end if;
end;
$do$;

rollback;

do $do$
begin
  if exists(select 1 from public.leis where slug like 'rpc-%')
    or exists(select 1 from auth.users where email like '%-rpc-local@example.invalid')
    or exists(select 1 from public.auditoria_administrativa where ator_user_id='31000001-0000-4000-8000-000000000001') then
    raise exception '22: rollback deixou residuo sintetico';
  end if;
end;
$do$;

select 'commercial_admin_rpcs: 22 cenarios aprovados' as resultado;
