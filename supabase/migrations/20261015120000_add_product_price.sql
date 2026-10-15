begin;

alter table public.produtos
  add column if not exists preco numeric(10,2) null;

do $block$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'produtos_preco_nao_negativo_check'
      and conrelid = 'public.produtos'::pg_catalog.regclass
  ) then
    alter table public.produtos
      add constraint produtos_preco_nao_negativo_check
      check (preco is null or preco >= 0);
  end if;
end;
$block$;

drop function if exists public.admin_criar_produto(uuid,text,text,text,text,text,text,text,boolean,integer,boolean,text,boolean,text);
drop function if exists public.admin_criar_produto(uuid,text,text,text,text,text,text,text,boolean,integer,boolean,text,boolean,text,numeric);

create function public.admin_criar_produto(
  p_ator_user_id uuid, p_nome text, p_slug text, p_descricao text,
  p_tipo_produto text, p_hotmart_url text, p_hotmart_product_id text,
  p_video_demo_url text, p_destaque boolean, p_ordem integer, p_ativo boolean,
  p_observacao_administrativa text, p_records_enabled boolean default false,
  p_imagem_url text default null, p_preco numeric default null
)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $function$
declare v_row public.produtos;
begin
  perform public.admin_comercial_validar_contexto(p_ator_user_id);
  if p_nome is null or pg_catalog.btrim(p_nome)=''
    or p_slug is null or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    or p_tipo_produto not in ('lei_avulsa','combo','edital','assinatura','outro')
    or p_ordem is null or p_ordem<0
    or p_preco is not null and (p_preco < 0 or p_preco > 99999999.99) then
    raise exception using errcode='22023',message='Dados do produto invalidos.';
  end if;
  insert into public.produtos (nome,tipo,slug,descricao,tipo_produto,hotmart_url,hotmart_product_id,video_demo_url,destaque,ordem,ativo,observacao_administrativa,records_enabled,imagem_url,preco)
  values (pg_catalog.btrim(p_nome),p_tipo_produto,p_slug,p_descricao,p_tipo_produto,p_hotmart_url,p_hotmart_product_id,nullif(p_video_demo_url,''),coalesce(p_destaque,false),p_ordem,p_ativo,p_observacao_administrativa,coalesce(p_records_enabled,false),nullif(p_imagem_url,''),p_preco)
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
  if p_dados is null or p_dados='{}'::jsonb or p_dados-array['nome','slug','descricao','tipo_produto','hotmart_url','hotmart_product_id','preco','video_demo_url','destaque','ordem','ativo','observacao_administrativa','records_enabled','imagem_url']<>'{}'::jsonb then
    raise exception using errcode='22023', message='Campos do produto invalidos.';
  end if;
  if p_dados?'preco' and (nullif(p_dados->>'preco','')::numeric < 0 or nullif(p_dados->>'preco','')::numeric > 99999999.99) then
    raise exception using errcode='22023', message='Preço inválido.';
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
    preco=case when p_dados?'preco' then nullif(p_dados->>'preco','')::numeric else preco end,
    video_demo_url=case when p_dados?'video_demo_url' then nullif(p_dados->>'video_demo_url','') else video_demo_url end,
    destaque=case when p_dados?'destaque' then (p_dados->>'destaque')::boolean else destaque end,
    ordem=case when p_dados?'ordem' then (p_dados->>'ordem')::integer else ordem end,
    ativo=case when p_dados?'ativo' then (p_dados->>'ativo')::boolean else ativo end,
    observacao_administrativa=case when p_dados?'observacao_administrativa' then nullif(p_dados->>'observacao_administrativa','') else observacao_administrativa end,
    records_enabled=case when p_dados?'records_enabled' then (p_dados->>'records_enabled')::boolean else records_enabled end,
    imagem_url=case when p_dados?'imagem_url' then nullif(p_dados->>'imagem_url','') else imagem_url end
  where id=p_produto_id returning * into v_after;
  perform public.admin_comercial_auditar(p_ator_user_id,'atualizar','produto',p_produto_id::text,pg_catalog.to_jsonb(v_before),pg_catalog.to_jsonb(v_after));
  return pg_catalog.to_jsonb(v_after);
end;
$function$;

revoke all on function public.admin_criar_produto(uuid,text,text,text,text,text,text,text,boolean,integer,boolean,text,boolean,text,numeric) from public, anon, authenticated;
grant execute on function public.admin_criar_produto(uuid,text,text,text,text,text,text,text,boolean,integer,boolean,text,boolean,text,numeric) to service_role;
revoke all on function public.admin_atualizar_produto(uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.admin_atualizar_produto(uuid,uuid,jsonb) to service_role;

commit;
