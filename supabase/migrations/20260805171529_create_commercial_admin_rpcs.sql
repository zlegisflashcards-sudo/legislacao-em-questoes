begin;

-- Operacoes administrativas da estrutura comercial interna. A sessao do
-- administrador e validada pela aplicacao; o banco aceita somente service_role
-- e exige que o identificador do ator corresponda a um usuario Auth existente.

create or replace function public.admin_comercial_validar_contexto(p_ator_user_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_role text;
begin
  v_role := coalesce(
    nullif(pg_catalog.current_setting('request.jwt.claim.role', true), ''),
    (nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  );
  if v_role is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'Contexto administrativo invalido.';
  end if;
  if p_ator_user_id is null or not exists (select 1 from auth.users where id = p_ator_user_id) then
    raise exception using errcode = '42501', message = 'Ator administrativo invalido.';
  end if;
end;
$function$;

create or replace function public.admin_comercial_auditar(
  p_ator_user_id uuid, p_acao text, p_entidade text, p_entidade_id text,
  p_anterior jsonb, p_posterior jsonb, p_detalhes jsonb default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  perform public.admin_comercial_validar_contexto(p_ator_user_id);
  insert into public.auditoria_administrativa
    (ator_user_id, acao, entidade, entidade_id, estado_anterior, estado_posterior, detalhes)
  values
    (p_ator_user_id, p_acao, p_entidade, p_entidade_id, p_anterior, p_posterior, p_detalhes);
end;
$function$;

create or replace function public.admin_criar_lei(
  p_ator_user_id uuid, p_slug text, p_titulo text, p_nome_curto text,
  p_descricao text, p_codigo text, p_categoria text, p_ativo boolean,
  p_ordem integer, p_thumbnail_url text
)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $function$
declare v_row public.leis;
begin
  perform public.admin_comercial_validar_contexto(p_ator_user_id);
  if p_slug is null or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    or p_titulo is null or pg_catalog.btrim(p_titulo) = '' or p_ordem is null or p_ordem < 0 then
    raise exception using errcode = '22023', message = 'Dados da lei invalidos.';
  end if;
  insert into public.leis (slug,titulo,nome_curto,descricao,codigo,categoria,ativo,ordem,thumbnail_url)
  values (p_slug,pg_catalog.btrim(p_titulo),p_nome_curto,p_descricao,p_codigo,p_categoria,p_ativo,p_ordem,p_thumbnail_url)
  returning * into v_row;
  perform public.admin_comercial_auditar(p_ator_user_id,'criar','lei',v_row.id::text,null,pg_catalog.to_jsonb(v_row));
  return pg_catalog.to_jsonb(v_row);
end;
$function$;

create or replace function public.admin_atualizar_lei(p_ator_user_id uuid, p_lei_id bigint, p_dados jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $function$
declare v_before public.leis; v_after public.leis;
begin
  perform public.admin_comercial_validar_contexto(p_ator_user_id);
  if p_dados is null or p_dados = '{}'::jsonb or p_dados - array['slug','titulo','nome_curto','descricao','codigo','categoria','ativo','ordem','thumbnail_url'] <> '{}'::jsonb then
    raise exception using errcode='22023', message='Campos da lei invalidos.';
  end if;
  select * into v_before from public.leis where id=p_lei_id for update;
  if not found then raise exception using errcode='P0002', message='Lei nao encontrada.'; end if;
  if (p_dados?'slug' and (p_dados->>'slug') !~ '^[a-z0-9]+(-[a-z0-9]+)*$')
    or (p_dados?'titulo' and pg_catalog.btrim(p_dados->>'titulo')='')
    or (p_dados?'ordem' and (p_dados->>'ordem')::integer<0) then
    raise exception using errcode='22023',message='Dados da lei invalidos.';
  end if;
  update public.leis set
    slug=case when p_dados?'slug' then p_dados->>'slug' else slug end,
    titulo=case when p_dados?'titulo' then pg_catalog.btrim(p_dados->>'titulo') else titulo end,
    nome_curto=case when p_dados?'nome_curto' then nullif(p_dados->>'nome_curto','') else nome_curto end,
    descricao=case when p_dados?'descricao' then nullif(p_dados->>'descricao','') else descricao end,
    codigo=case when p_dados?'codigo' then nullif(p_dados->>'codigo','') else codigo end,
    categoria=case when p_dados?'categoria' then nullif(p_dados->>'categoria','') else categoria end,
    ativo=case when p_dados?'ativo' then (p_dados->>'ativo')::boolean else ativo end,
    ordem=case when p_dados?'ordem' then (p_dados->>'ordem')::integer else ordem end,
    thumbnail_url=case when p_dados?'thumbnail_url' then nullif(p_dados->>'thumbnail_url','') else thumbnail_url end
  where id=p_lei_id returning * into v_after;
  perform public.admin_comercial_auditar(p_ator_user_id,'atualizar','lei',p_lei_id::text,pg_catalog.to_jsonb(v_before),pg_catalog.to_jsonb(v_after));
  return pg_catalog.to_jsonb(v_after);
end;
$function$;

create or replace function public.admin_criar_material_lei(
  p_ator_user_id uuid, p_lei_id bigint, p_tipo text, p_titulo text,
  p_descricao text, p_provedor text, p_url_externa text, p_acao text,
  p_ordem integer, p_ativo boolean
)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $function$
declare v_row public.materiais_leis;
begin
  perform public.admin_comercial_validar_contexto(p_ator_user_id);
  if not exists(select 1 from public.leis where id=p_lei_id)
    or p_tipo not in ('flashcards','video','pdf','tutorial','audio','outro')
    or p_provedor not in ('google_drive','youtube','externo','supabase_storage')
    or p_acao not in ('abrir','baixar','assistir')
    or p_titulo is null or pg_catalog.btrim(p_titulo)=''
    or p_url_externa is null or pg_catalog.btrim(p_url_externa)=''
    or p_ordem is null or p_ordem<0 then
    raise exception using errcode='22023',message='Dados do material invalidos.';
  end if;
  insert into public.materiais_leis (lei_id,tipo,titulo,descricao,provedor,url_externa,acao,ordem,ativo)
  values (p_lei_id,p_tipo,pg_catalog.btrim(p_titulo),p_descricao,p_provedor,pg_catalog.btrim(p_url_externa),p_acao,p_ordem,p_ativo)
  returning * into v_row;
  perform public.admin_comercial_auditar(p_ator_user_id,'criar','material_lei',v_row.id::text,null,pg_catalog.to_jsonb(v_row));
  return pg_catalog.to_jsonb(v_row);
end;
$function$;

create or replace function public.admin_atualizar_material_lei(p_ator_user_id uuid, p_material_id bigint, p_dados jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $function$
declare v_before public.materiais_leis; v_after public.materiais_leis;
begin
  perform public.admin_comercial_validar_contexto(p_ator_user_id);
  if p_dados is null or p_dados='{}'::jsonb or p_dados-array['tipo','titulo','descricao','provedor','url_externa','acao','ordem','ativo']<>'{}'::jsonb then
    raise exception using errcode='22023', message='Campos do material invalidos.';
  end if;
  select * into v_before from public.materiais_leis where id=p_material_id for update;
  if not found then raise exception using errcode='P0002', message='Material nao encontrado.'; end if;
  update public.materiais_leis set
    tipo=case when p_dados?'tipo' then p_dados->>'tipo' else tipo end,
    titulo=case when p_dados?'titulo' then pg_catalog.btrim(p_dados->>'titulo') else titulo end,
    descricao=case when p_dados?'descricao' then nullif(p_dados->>'descricao','') else descricao end,
    provedor=case when p_dados?'provedor' then p_dados->>'provedor' else provedor end,
    url_externa=case when p_dados?'url_externa' then pg_catalog.btrim(p_dados->>'url_externa') else url_externa end,
    acao=case when p_dados?'acao' then p_dados->>'acao' else acao end,
    ordem=case when p_dados?'ordem' then (p_dados->>'ordem')::integer else ordem end,
    ativo=case when p_dados?'ativo' then (p_dados->>'ativo')::boolean else ativo end
  where id=p_material_id returning * into v_after;
  perform public.admin_comercial_auditar(p_ator_user_id,'atualizar','material_lei',p_material_id::text,pg_catalog.to_jsonb(v_before),pg_catalog.to_jsonb(v_after));
  return pg_catalog.to_jsonb(v_after);
end;
$function$;

create or replace function public.admin_criar_produto(
  p_ator_user_id uuid, p_nome text, p_slug text, p_descricao text,
  p_tipo_produto text, p_hotmart_url text, p_hotmart_product_id text,
  p_ordem integer, p_ativo boolean, p_observacao_administrativa text
)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $function$
declare v_row public.produtos;
begin
  perform public.admin_comercial_validar_contexto(p_ator_user_id);
  if p_nome is null or pg_catalog.btrim(p_nome)=''
    or p_slug is null or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    or p_tipo_produto not in ('lei_avulsa','combo','edital','assinatura','outro')
    or p_ordem is null or p_ordem<0 then
    raise exception using errcode='22023',message='Dados do produto invalidos.';
  end if;
  insert into public.produtos (nome,tipo,slug,descricao,tipo_produto,hotmart_url,hotmart_product_id,ordem,ativo,observacao_administrativa)
  values (pg_catalog.btrim(p_nome),p_tipo_produto,p_slug,p_descricao,p_tipo_produto,p_hotmart_url,p_hotmart_product_id,p_ordem,p_ativo,p_observacao_administrativa)
  returning * into v_row;
  perform public.admin_comercial_auditar(p_ator_user_id,'criar','produto',v_row.id::text,null,pg_catalog.to_jsonb(v_row));
  return pg_catalog.to_jsonb(v_row);
end;
$function$;

create or replace function public.admin_atualizar_produto(p_ator_user_id uuid, p_produto_id uuid, p_dados jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $function$
declare v_before public.produtos; v_after public.produtos;
begin
  perform public.admin_comercial_validar_contexto(p_ator_user_id);
  if p_dados is null or p_dados='{}'::jsonb or p_dados-array['nome','slug','descricao','tipo_produto','hotmart_url','hotmart_product_id','ordem','ativo','observacao_administrativa']<>'{}'::jsonb then
    raise exception using errcode='22023', message='Campos do produto invalidos.';
  end if;
  select * into v_before from public.produtos where id=p_produto_id for update;
  if not found then raise exception using errcode='P0002', message='Produto nao encontrado.'; end if;
  update public.produtos set
    nome=case when p_dados?'nome' then pg_catalog.btrim(p_dados->>'nome') else nome end,
    slug=case when p_dados?'slug' then nullif(p_dados->>'slug','') else slug end,
    descricao=case when p_dados?'descricao' then nullif(p_dados->>'descricao','') else descricao end,
    tipo_produto=case when p_dados?'tipo_produto' then p_dados->>'tipo_produto' else tipo_produto end,
    tipo=case when p_dados?'tipo_produto' then p_dados->>'tipo_produto' else tipo end,
    hotmart_url=case when p_dados?'hotmart_url' then nullif(p_dados->>'hotmart_url','') else hotmart_url end,
    hotmart_product_id=case when p_dados?'hotmart_product_id' then nullif(p_dados->>'hotmart_product_id','') else hotmart_product_id end,
    ordem=case when p_dados?'ordem' then (p_dados->>'ordem')::integer else ordem end,
    ativo=case when p_dados?'ativo' then (p_dados->>'ativo')::boolean else ativo end,
    observacao_administrativa=case when p_dados?'observacao_administrativa' then nullif(p_dados->>'observacao_administrativa','') else observacao_administrativa end
  where id=p_produto_id returning * into v_after;
  perform public.admin_comercial_auditar(p_ator_user_id,'atualizar','produto',p_produto_id::text,pg_catalog.to_jsonb(v_before),pg_catalog.to_jsonb(v_after));
  return pg_catalog.to_jsonb(v_after);
end;
$function$;

create or replace function public.admin_definir_leis_produto(p_ator_user_id uuid, p_produto_id uuid, p_lei_ids bigint[])
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $function$
declare v_before jsonb; v_after jsonb; v_total integer; v_expected integer; v_found integer;
begin
  perform public.admin_comercial_validar_contexto(p_ator_user_id);
  if not exists(select 1 from public.produtos where id=p_produto_id for update) then raise exception using errcode='P0002',message='Produto nao encontrado.'; end if;
  select pg_catalog.count(x),pg_catalog.count(distinct x),pg_catalog.count(distinct l.id) into v_total,v_expected,v_found
  from pg_catalog.unnest(coalesce(p_lei_ids,array[]::bigint[])) x
  left join public.leis l on l.id=x;
  if v_total<>v_expected or v_expected<>v_found then raise exception using errcode='22023',message='Composicao contem lei duplicada ou inexistente.'; end if;
  select coalesce(pg_catalog.jsonb_agg(lei_id order by ordem,lei_id),'[]'::jsonb) into v_before from public.produto_leis where produto_id=p_produto_id;
  delete from public.produto_leis where produto_id=p_produto_id;
  insert into public.produto_leis(produto_id,lei_id,ordem)
  select p_produto_id,x.id,x.ordem::integer-1 from pg_catalog.unnest(coalesce(p_lei_ids,array[]::bigint[])) with ordinality x(id,ordem);
  select coalesce(pg_catalog.jsonb_agg(lei_id order by ordem,lei_id),'[]'::jsonb) into v_after from public.produto_leis where produto_id=p_produto_id;
  perform public.admin_comercial_auditar(p_ator_user_id,'definir_leis','produto',p_produto_id::text,v_before,v_after,pg_catalog.jsonb_build_object('concessao_retroativa',false));
  return pg_catalog.jsonb_build_object('produto_id',p_produto_id,'lei_ids',v_after);
end;
$function$;

create or replace function public.admin_registrar_aquisicao(
  p_ator_user_id uuid, p_aluno_id uuid, p_produto_id uuid, p_origem text,
  p_identificador_externo text, p_observacao_administrativa text
)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $function$
declare v_compra public.compras; v_count integer; v_product public.produtos;
begin
  perform public.admin_comercial_validar_contexto(p_ator_user_id);
  if p_origem not in ('hotmart','cortesia','amostra','premiacao','migracao','administrativo') then raise exception using errcode='22023',message='Origem invalida.'; end if;
  if not exists(select 1 from public.alunos where id=p_aluno_id) then raise exception using errcode='P0002',message='Aluno nao encontrado.'; end if;
  select * into v_product from public.produtos where id=p_produto_id and ativo=true;
  if not found then raise exception using errcode='P0002',message='Produto ativo nao encontrado.'; end if;
  insert into public.compras(aluno_id,produto_id,hotmart_product_id,hotmart_transaction_id,status,origem,identificador_externo,observacao_administrativa,administrador_user_id,status_acesso,adquirida_em,comprada_em)
  values(p_aluno_id,p_produto_id,case when p_origem='hotmart' then v_product.hotmart_product_id else null end,case when p_origem='hotmart' then p_identificador_externo else null end,case when p_origem='hotmart' then 'aprovada' else 'manual' end,p_origem,p_identificador_externo,p_observacao_administrativa,p_ator_user_id,'ativo',pg_catalog.now(),pg_catalog.now())
  returning * into v_compra;
  insert into public.liberacoes_leis(aluno_id,lei_id,compra_id,produto_id,origem,status,motivo,concedida_por)
  select p_aluno_id,pl.lei_id,v_compra.id,p_produto_id,case when p_origem='hotmart' then 'hotmart' else 'produto' end,'ativo',p_observacao_administrativa,p_ator_user_id
  from public.produto_leis pl join public.leis l on l.id=pl.lei_id and l.ativo=true where pl.produto_id=p_produto_id;
  get diagnostics v_count = row_count;
  perform public.admin_comercial_auditar(p_ator_user_id,'registrar','compra',v_compra.id::text,null,pg_catalog.to_jsonb(v_compra),pg_catalog.jsonb_build_object('liberacoes_criadas',v_count));
  return pg_catalog.jsonb_build_object('compra',pg_catalog.to_jsonb(v_compra),'liberacoes_criadas',v_count);
end;
$function$;

create or replace function public.admin_alterar_status_aquisicao(p_ator_user_id uuid,p_compra_id uuid,p_status_acesso text,p_status_legado text,p_acao text)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $function$
declare v_before public.compras; v_after public.compras; v_count integer; v_release_status text;
begin
  perform public.admin_comercial_validar_contexto(p_ator_user_id);
  select * into v_before from public.compras where id=p_compra_id for update;
  if not found then raise exception using errcode='P0002',message='Aquisicao nao encontrada.'; end if;
  v_release_status:=case p_status_acesso when 'ativo' then 'ativo' when 'cancelado' then 'cancelado' else 'reembolsado' end;
  update public.compras set status_acesso=p_status_acesso,status=p_status_legado,
    cancelada_em=case when p_status_acesso='cancelado' then pg_catalog.now() else cancelada_em end,
    reembolsada_em=case when p_status_acesso='reembolsado' then pg_catalog.now() else reembolsada_em end,
    reativada_em=case when p_status_acesso='ativo' then pg_catalog.now() else reativada_em end,
    administrador_user_id=p_ator_user_id
  where id=p_compra_id returning * into v_after;
  update public.liberacoes_leis set status=v_release_status,
    revogada_por=case when v_release_status='ativo' then null else p_ator_user_id end,
    revogada_em=case when v_release_status='ativo' then null else pg_catalog.now() end
  where compra_id=p_compra_id;
  get diagnostics v_count=row_count;
  perform public.admin_comercial_auditar(p_ator_user_id,p_acao,'compra',p_compra_id::text,pg_catalog.to_jsonb(v_before),pg_catalog.to_jsonb(v_after),pg_catalog.jsonb_build_object('liberacoes_atualizadas',v_count,'somente_historicas',true));
  return pg_catalog.jsonb_build_object('compra',pg_catalog.to_jsonb(v_after),'liberacoes_atualizadas',v_count);
end;
$function$;

create or replace function public.admin_cancelar_aquisicao(p_ator_user_id uuid,p_compra_id uuid)
returns jsonb language sql security definer set search_path=pg_catalog
as $function$ select public.admin_alterar_status_aquisicao(p_ator_user_id,p_compra_id,'cancelado','cancelada','cancelar') $function$;
create or replace function public.admin_reembolsar_aquisicao(p_ator_user_id uuid,p_compra_id uuid)
returns jsonb language sql security definer set search_path=pg_catalog
as $function$ select public.admin_alterar_status_aquisicao(p_ator_user_id,p_compra_id,'reembolsado','reembolsada','reembolsar') $function$;
create or replace function public.admin_reativar_aquisicao(p_ator_user_id uuid,p_compra_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $function$
declare v_origin text;
begin
  perform public.admin_comercial_validar_contexto(p_ator_user_id);
  select origem into v_origin from public.compras where id=p_compra_id;
  if not found then raise exception using errcode='P0002',message='Aquisicao nao encontrada.'; end if;
  return public.admin_alterar_status_aquisicao(p_ator_user_id,p_compra_id,'ativo',case when v_origin='hotmart' then 'aprovada' else 'manual' end,'reativar');
end;
$function$;

create or replace function public.admin_conceder_lei_manual(p_ator_user_id uuid,p_aluno_id uuid,p_lei_id bigint,p_origem text,p_motivo text)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $function$
declare v_row public.liberacoes_leis;
begin
  perform public.admin_comercial_validar_contexto(p_ator_user_id);
  if p_origem not in ('cortesia','amostra','premiacao','migracao','administrativo') then raise exception using errcode='22023',message='Origem manual invalida.'; end if;
  if not exists(select 1 from public.alunos where id=p_aluno_id) or not exists(select 1 from public.leis where id=p_lei_id and ativo=true) then raise exception using errcode='P0002',message='Aluno ou lei nao encontrado.'; end if;
  insert into public.liberacoes_leis(aluno_id,lei_id,origem,status,motivo,concedida_por)
  values(p_aluno_id,p_lei_id,p_origem,'ativo',p_motivo,p_ator_user_id) returning * into v_row;
  perform public.admin_comercial_auditar(p_ator_user_id,'conceder','liberacao_lei',v_row.id::text,null,pg_catalog.to_jsonb(v_row));
  return pg_catalog.to_jsonb(v_row);
end;
$function$;

create or replace function public.admin_revogar_liberacao(p_ator_user_id uuid,p_liberacao_id bigint,p_motivo text)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $function$
declare v_before public.liberacoes_leis; v_after public.liberacoes_leis; v_other integer;
begin
  perform public.admin_comercial_validar_contexto(p_ator_user_id);
  select * into v_before from public.liberacoes_leis where id=p_liberacao_id for update;
  if not found then raise exception using errcode='P0002',message='Liberacao nao encontrada.'; end if;
  if v_before.status<>'ativo' then raise exception using errcode='22023',message='Liberacao nao esta ativa.'; end if;
  update public.liberacoes_leis set status='revogado',motivo=coalesce(p_motivo,motivo),revogada_por=p_ator_user_id,revogada_em=pg_catalog.now()
  where id=p_liberacao_id returning * into v_after;
  select pg_catalog.count(*) into v_other from public.liberacoes_leis where aluno_id=v_before.aluno_id and lei_id=v_before.lei_id and status='ativo';
  perform public.admin_comercial_auditar(p_ator_user_id,'revogar','liberacao_lei',p_liberacao_id::text,pg_catalog.to_jsonb(v_before),pg_catalog.to_jsonb(v_after),pg_catalog.jsonb_build_object('outras_fontes_ativas',v_other));
  return pg_catalog.jsonb_build_object('liberacao',pg_catalog.to_jsonb(v_after),'outras_fontes_ativas',v_other);
end;
$function$;

do $do$
declare v_function pg_catalog.regprocedure;
begin
  for v_function in
    select p.oid::pg_catalog.regprocedure from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname = any(array[
      'admin_comercial_validar_contexto','admin_comercial_auditar','admin_alterar_status_aquisicao',
      'admin_criar_lei','admin_atualizar_lei','admin_criar_material_lei','admin_atualizar_material_lei',
      'admin_criar_produto','admin_atualizar_produto','admin_definir_leis_produto','admin_registrar_aquisicao',
      'admin_cancelar_aquisicao','admin_reembolsar_aquisicao','admin_reativar_aquisicao',
      'admin_conceder_lei_manual','admin_revogar_liberacao'
    ])
  loop
    execute pg_catalog.format('revoke all on function %s from public, anon, authenticated',v_function);
    execute pg_catalog.format('grant execute on function %s to service_role',v_function);
  end loop;
end;
$do$;

commit;
