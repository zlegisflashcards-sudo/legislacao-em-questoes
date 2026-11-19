begin;

alter table public.leis
  add column if not exists total_artigos integer;

alter table public.leis
  drop constraint if exists leis_total_artigos_check;

alter table public.leis
  add constraint leis_total_artigos_check
  check (total_artigos is null or total_artigos > 0);

comment on column public.leis.total_artigos is
  'Número total de artigos da lei, usado como padrão único em todos os cards Anki exportados.';

create or replace function public.admin_atualizar_lei(
  p_ator_user_id uuid,
  p_lei_id bigint,
  p_dados jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_before public.leis;
  v_after public.leis;
  v_status text;
  v_conferencia text;
begin
  perform public.admin_comercial_validar_contexto(p_ator_user_id);

  if p_dados is null or p_dados = '{}'::jsonb or p_dados - array[
    'slug', 'titulo', 'nome_curto', 'descricao', 'codigo', 'categoria', 'ativo',
    'status_publicacao', 'acesso_gratuito', 'ordem', 'thumbnail_url', 'total_artigos',
    'norma_originaria_referencia', 'norma_originaria_data', 'houve_alteracao_legislativa',
    'ultima_alteracao_referencia', 'ultima_alteracao_data', 'situacao_atualizacao',
    'situacao_conferencia'
  ] <> '{}'::jsonb then
    raise exception using errcode = '22023', message = 'Campos da lei invalidos.';
  end if;

  select * into v_before from public.leis where id = p_lei_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Lei nao encontrada.';
  end if;

  v_status := case
    when p_dados ? 'status_publicacao' then p_dados ->> 'status_publicacao'
    when p_dados ? 'ativo' then case when (p_dados ->> 'ativo')::boolean then 'ativa' else 'inativa' end
    else v_before.status_publicacao
  end;
  if v_status not in ('ativa', 'em_breve', 'inativa') then
    raise exception using errcode = '22023', message = 'Status de publicacao invalido.';
  end if;

  v_conferencia := case when p_dados ? 'situacao_conferencia' then nullif(p_dados ->> 'situacao_conferencia', '') else v_before.situacao_conferencia end;
  if v_conferencia is not null and v_conferencia not in ('para_conferir', 'conferido') then
    raise exception using errcode = '22023', message = 'Situacao de conferencia invalida.';
  end if;
  if p_dados ? 'situacao_atualizacao' and p_dados ->> 'situacao_atualizacao' not in ('nao_verificado', 'atualizado', 'desatualizado') then
    raise exception using errcode = '22023', message = 'Situacao de atualizacao invalida.';
  end if;
  if p_dados ? 'total_artigos' and (
    jsonb_typeof(p_dados -> 'total_artigos') not in ('number', 'null')
    or (p_dados -> 'total_artigos' <> 'null'::jsonb and (
      p_dados ->> 'total_artigos' !~ '^[1-9][0-9]*$'
      or (p_dados ->> 'total_artigos')::numeric > 2147483647
    ))
  ) then
    raise exception using errcode = '22023', message = 'Total de artigos invalido.';
  end if;

  update public.leis set
    slug = case when p_dados ? 'slug' then p_dados ->> 'slug' else slug end,
    titulo = case when p_dados ? 'titulo' then btrim(p_dados ->> 'titulo') else titulo end,
    nome_curto = case when p_dados ? 'nome_curto' then nullif(p_dados ->> 'nome_curto', '') else nome_curto end,
    descricao = case when p_dados ? 'descricao' then nullif(p_dados ->> 'descricao', '') else descricao end,
    codigo = case when p_dados ? 'codigo' then nullif(p_dados ->> 'codigo', '') else codigo end,
    categoria = case when p_dados ? 'categoria' then nullif(p_dados ->> 'categoria', '') else categoria end,
    status_publicacao = v_status,
    ativo = v_status <> 'inativa',
    acesso_gratuito = case when p_dados ? 'acesso_gratuito' then (p_dados ->> 'acesso_gratuito')::boolean else acesso_gratuito end,
    ordem = case when p_dados ? 'ordem' then (p_dados ->> 'ordem')::integer else ordem end,
    thumbnail_url = case when p_dados ? 'thumbnail_url' then nullif(p_dados ->> 'thumbnail_url', '') else thumbnail_url end,
    total_artigos = case when p_dados ? 'total_artigos' then case when p_dados -> 'total_artigos' = 'null'::jsonb then null else (p_dados ->> 'total_artigos')::integer end else total_artigos end,
    norma_originaria_referencia = case when p_dados ? 'norma_originaria_referencia' then nullif(p_dados ->> 'norma_originaria_referencia', '') else norma_originaria_referencia end,
    norma_originaria_data = case when p_dados ? 'norma_originaria_data' then nullif(p_dados ->> 'norma_originaria_data', '')::date else norma_originaria_data end,
    houve_alteracao_legislativa = case when p_dados ? 'houve_alteracao_legislativa' then (p_dados ->> 'houve_alteracao_legislativa')::boolean else houve_alteracao_legislativa end,
    ultima_alteracao_referencia = case when p_dados ? 'ultima_alteracao_referencia' then nullif(p_dados ->> 'ultima_alteracao_referencia', '') else ultima_alteracao_referencia end,
    ultima_alteracao_data = case when p_dados ? 'ultima_alteracao_data' then nullif(p_dados ->> 'ultima_alteracao_data', '')::date else ultima_alteracao_data end,
    situacao_atualizacao = case when p_dados ? 'situacao_atualizacao' then p_dados ->> 'situacao_atualizacao' else situacao_atualizacao end,
    situacao_conferencia = v_conferencia
  where id = p_lei_id
  returning * into v_after;

  perform public.admin_comercial_auditar(
    p_ator_user_id,
    'atualizar',
    'lei',
    p_lei_id::text,
    to_jsonb(v_before),
    to_jsonb(v_after)
  );
  return to_jsonb(v_after);
end;
$function$;

revoke all on function public.admin_atualizar_lei(uuid, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.admin_atualizar_lei(uuid, bigint, jsonb) to service_role;

create or replace function public.admin_criar_lei(
  p_ator_user_id uuid,
  p_slug text,
  p_titulo text,
  p_nome_curto text,
  p_descricao text,
  p_codigo text,
  p_categoria text,
  p_ativo boolean,
  p_ordem integer,
  p_thumbnail_url text,
  p_total_artigos integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_row public.leis;
begin
  perform public.admin_comercial_validar_contexto(p_ator_user_id);
  if p_slug is null or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    or p_titulo is null or btrim(p_titulo) = '' or p_ordem is null or p_ordem < 0 then
    raise exception using errcode = '22023', message = 'Dados da lei invalidos.';
  end if;
  if p_total_artigos is not null and p_total_artigos < 1 then
    raise exception using errcode = '22023', message = 'Total de artigos invalido.';
  end if;
  insert into public.leis (slug, titulo, nome_curto, descricao, codigo, categoria, ativo, ordem, thumbnail_url, total_artigos)
  values (p_slug, btrim(p_titulo), p_nome_curto, p_descricao, p_codigo, p_categoria, p_ativo, p_ordem, p_thumbnail_url, p_total_artigos)
  returning * into v_row;
  perform public.admin_comercial_auditar(p_ator_user_id, 'criar', 'lei', v_row.id::text, null, to_jsonb(v_row));
  return to_jsonb(v_row);
end;
$function$;

revoke all on function public.admin_criar_lei(uuid, text, text, text, text, text, text, boolean, integer, text, integer) from public, anon, authenticated;
grant execute on function public.admin_criar_lei(uuid, text, text, text, text, text, text, boolean, integer, text, integer) to service_role;

commit;
