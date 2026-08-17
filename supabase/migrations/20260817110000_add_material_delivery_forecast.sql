begin;

alter table public.materiais_leis add column if not exists data_entrega_prevista date;
alter table public.materiais_leis alter column url_externa drop not null;
alter table public.materiais_leis drop constraint if exists materiais_leis_url_nao_vazia;

drop function if exists public.admin_criar_material_lei(uuid,bigint,text,text,text,text,text,text,integer,boolean,integer,text,date,date,text);
create function public.admin_criar_material_lei(
  p_ator_user_id uuid,p_lei_id bigint,p_tipo text,p_titulo text,p_descricao text,p_provedor text,p_url_externa text,p_acao text,p_ordem integer,p_ativo boolean,
  p_quantidade_itens integer,p_versao_material text,p_revisado_em date,p_publicado_em date,p_observacao_interna text,p_data_entrega_prevista date default null
) returns jsonb language plpgsql security definer set search_path=pg_catalog
as $function$
declare v_row public.materiais_leis;
begin
  perform public.admin_comercial_validar_contexto(p_ator_user_id);
  if not exists(select 1 from public.leis where id=p_lei_id) or p_tipo not in ('flashcards','video','pdf','tutorial','audio','outro') or p_provedor not in ('google_drive','youtube','externo','supabase_storage') or p_acao not in ('abrir','baixar','assistir') or p_titulo is null or pg_catalog.btrim(p_titulo)='' or p_ordem is null or p_ordem<0 then raise exception using errcode='22023',message='Dados do material invalidos.'; end if;
  insert into public.materiais_leis(lei_id,tipo,titulo,descricao,provedor,url_externa,acao,ordem,ativo,quantidade_itens,versao_material,revisado_em,publicado_em,data_entrega_prevista,observacao_interna)
  values(p_lei_id,p_tipo,pg_catalog.btrim(p_titulo),p_descricao,p_provedor,nullif(pg_catalog.btrim(p_url_externa),''),p_acao,p_ordem,p_ativo,p_quantidade_itens,p_versao_material,p_revisado_em,p_publicado_em,p_data_entrega_prevista,p_observacao_interna)
  returning * into v_row;
  perform public.admin_comercial_auditar(p_ator_user_id,'criar','material_lei',v_row.id::text,null,pg_catalog.to_jsonb(v_row));
  return pg_catalog.to_jsonb(v_row);
end;
$function$;

create or replace function public.admin_atualizar_material_lei(p_ator_user_id uuid,p_material_id bigint,p_dados jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $function$
declare v_before public.materiais_leis;v_after public.materiais_leis;
begin
  perform public.admin_comercial_validar_contexto(p_ator_user_id);
  if p_dados is null or p_dados='{}'::jsonb or p_dados-array['tipo','titulo','descricao','provedor','url_externa','acao','ordem','ativo','quantidade_itens','versao_material','revisado_em','publicado_em','data_entrega_prevista','observacao_interna']<>'{}'::jsonb then raise exception using errcode='22023',message='Campos do material invalidos.'; end if;
  select * into v_before from public.materiais_leis where id=p_material_id for update;
  if not found then raise exception using errcode='P0002',message='Material nao encontrado.'; end if;
  update public.materiais_leis set
    tipo=case when p_dados?'tipo' then p_dados->>'tipo' else tipo end,
    titulo=case when p_dados?'titulo' then pg_catalog.btrim(p_dados->>'titulo') else titulo end,
    descricao=case when p_dados?'descricao' then nullif(p_dados->>'descricao','') else descricao end,
    provedor=case when p_dados?'provedor' then p_dados->>'provedor' else provedor end,
    url_externa=case when p_dados?'url_externa' then nullif(pg_catalog.btrim(p_dados->>'url_externa'),'') else url_externa end,
    acao=case when p_dados?'acao' then p_dados->>'acao' else acao end,
    ordem=case when p_dados?'ordem' then (p_dados->>'ordem')::integer else ordem end,
    ativo=case when p_dados?'ativo' then (p_dados->>'ativo')::boolean else ativo end,
    quantidade_itens=case when p_dados?'quantidade_itens' then nullif(p_dados->>'quantidade_itens','')::integer else quantidade_itens end,
    versao_material=case when p_dados?'versao_material' then nullif(p_dados->>'versao_material','') else versao_material end,
    revisado_em=case when p_dados?'revisado_em' then nullif(p_dados->>'revisado_em','')::date else revisado_em end,
    publicado_em=case when p_dados?'publicado_em' then nullif(p_dados->>'publicado_em','')::date else publicado_em end,
    data_entrega_prevista=case when p_dados?'data_entrega_prevista' then nullif(p_dados->>'data_entrega_prevista','')::date else data_entrega_prevista end,
    observacao_interna=case when p_dados?'observacao_interna' then nullif(p_dados->>'observacao_interna','') else observacao_interna end
  where id=p_material_id returning * into v_after;
  perform public.admin_comercial_auditar(p_ator_user_id,'atualizar','material_lei',p_material_id::text,pg_catalog.to_jsonb(v_before),pg_catalog.to_jsonb(v_after));
  return pg_catalog.to_jsonb(v_after);
end;
$function$;

revoke all on function public.admin_criar_material_lei(uuid,bigint,text,text,text,text,text,text,integer,boolean,integer,text,date,date,text,date), public.admin_atualizar_material_lei(uuid,bigint,jsonb) from public, anon, authenticated;
grant execute on function public.admin_criar_material_lei(uuid,bigint,text,text,text,text,text,text,integer,boolean,integer,text,date,date,text,date), public.admin_atualizar_material_lei(uuid,bigint,jsonb) to service_role;

commit;
