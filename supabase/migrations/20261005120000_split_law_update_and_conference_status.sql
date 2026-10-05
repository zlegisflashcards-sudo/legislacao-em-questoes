begin;

alter table public.leis
  add column if not exists situacao_conferencia text not null default 'para_conferir';

update public.leis
set situacao_atualizacao = 'desatualizado',
    situacao_conferencia = 'para_conferir'
where situacao_atualizacao in ('revisao_pendente', 'em_revisao');

alter table public.leis drop constraint if exists leis_situacao_atualizacao_check;
alter table public.leis add constraint leis_situacao_atualizacao_check
  check (situacao_atualizacao in ('atualizado', 'desatualizado'));

alter table public.leis drop constraint if exists leis_situacao_conferencia_check;
alter table public.leis add constraint leis_situacao_conferencia_check
  check (situacao_conferencia in ('para_conferir', 'conferido'));

create or replace function public.admin_atualizar_lei(p_ator_user_id uuid,p_lei_id bigint,p_dados jsonb)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_before public.leis; v_after public.leis; v_status text; v_conferencia text;
begin
  perform public.admin_comercial_validar_contexto(p_ator_user_id);
  if p_dados is null or p_dados='{}'::jsonb or p_dados-array['slug','titulo','nome_curto','descricao','codigo','categoria','ativo','status_publicacao','acesso_gratuito','ordem','thumbnail_url','norma_originaria_referencia','norma_originaria_data','houve_alteracao_legislativa','ultima_alteracao_referencia','ultima_alteracao_data','situacao_atualizacao','situacao_conferencia']<>'{}'::jsonb then raise exception using errcode='22023',message='Campos da lei invalidos.'; end if;
  select * into v_before from public.leis where id=p_lei_id for update;
  if not found then raise exception using errcode='P0002',message='Lei nao encontrada.'; end if;
  v_status:=case when p_dados?'status_publicacao' then p_dados->>'status_publicacao' when p_dados?'ativo' then case when (p_dados->>'ativo')::boolean then 'ativa' else 'inativa' end else v_before.status_publicacao end;
  if v_status not in ('ativa','em_breve','inativa') then raise exception using errcode='22023',message='Status de publicacao invalido.'; end if;
  v_conferencia:=case when p_dados?'situacao_conferencia' then p_dados->>'situacao_conferencia' else v_before.situacao_conferencia end;
  if v_conferencia not in ('para_conferir','conferido') then raise exception using errcode='22023',message='Situacao de conferencia invalida.'; end if;
  if p_dados?'situacao_atualizacao' and p_dados->>'situacao_atualizacao' not in ('atualizado','desatualizado') then raise exception using errcode='22023',message='Situacao de atualizacao invalida.'; end if;
  update public.leis set slug=case when p_dados?'slug' then p_dados->>'slug' else slug end,titulo=case when p_dados?'titulo' then pg_catalog.btrim(p_dados->>'titulo') else titulo end,nome_curto=case when p_dados?'nome_curto' then nullif(p_dados->>'nome_curto','') else nome_curto end,descricao=case when p_dados?'descricao' then nullif(p_dados->>'descricao','') else descricao end,codigo=case when p_dados?'codigo' then nullif(p_dados->>'codigo','') else codigo end,categoria=case when p_dados?'categoria' then nullif(p_dados->>'categoria','') else categoria end,status_publicacao=v_status,ativo=(v_status<>'inativa'),acesso_gratuito=case when p_dados?'acesso_gratuito' then (p_dados->>'acesso_gratuito')::boolean else acesso_gratuito end,ordem=case when p_dados?'ordem' then (p_dados->>'ordem')::integer else ordem end,thumbnail_url=case when p_dados?'thumbnail_url' then nullif(p_dados->>'thumbnail_url','') else thumbnail_url end,norma_originaria_referencia=case when p_dados?'norma_originaria_referencia' then nullif(p_dados->>'norma_originaria_referencia','') else norma_originaria_referencia end,norma_originaria_data=case when p_dados?'norma_originaria_data' then nullif(p_dados->>'norma_originaria_data','')::date else norma_originaria_data end,houve_alteracao_legislativa=case when p_dados?'houve_alteracao_legislativa' then (p_dados->>'houve_alteracao_legislativa')::boolean else houve_alteracao_legislativa end,ultima_alteracao_referencia=case when p_dados?'ultima_alteracao_referencia' then nullif(p_dados->>'ultima_alteracao_referencia','') else ultima_alteracao_referencia end,ultima_alteracao_data=case when p_dados?'ultima_alteracao_data' then nullif(p_dados->>'ultima_alteracao_data','')::date else ultima_alteracao_data end,situacao_atualizacao=case when p_dados?'situacao_atualizacao' then p_dados->>'situacao_atualizacao' else situacao_atualizacao end,situacao_conferencia=v_conferencia where id=p_lei_id returning * into v_after;
  perform public.admin_comercial_auditar(p_ator_user_id,'atualizar','lei',p_lei_id::text,pg_catalog.to_jsonb(v_before),pg_catalog.to_jsonb(v_after));
  return pg_catalog.to_jsonb(v_after);
end;
$function$;

revoke all on function public.admin_atualizar_lei(uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.admin_atualizar_lei(uuid,bigint,jsonb) to service_role;

comment on column public.leis.situacao_atualizacao is 'Estado editorial da atualização: atualizado ou desatualizado.';
comment on column public.leis.situacao_conferencia is 'Estado administrativo independente de conferência: para conferir ou conferido.';

commit;
