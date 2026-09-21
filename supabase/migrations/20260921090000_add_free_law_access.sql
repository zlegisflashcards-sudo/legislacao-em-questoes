begin;

alter table public.leis add column if not exists acesso_gratuito boolean not null default false;
comment on column public.leis.acesso_gratuito is 'Lei acessível a qualquer aluno autenticado, sem liberação comercial.';

-- Registro canônico da Constituição Federal já existente na base.
update public.leis set acesso_gratuito=true where slug='cf';

-- Mantém a atualização central de leis como a única via administrativa para
-- este atributo. A validação de administrador e a auditoria permanecem na RPC.
create or replace function public.admin_atualizar_lei(p_ator_user_id uuid,p_lei_id bigint,p_dados jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $function$
declare v_before public.leis;v_after public.leis;
begin
  perform public.admin_comercial_validar_contexto(p_ator_user_id);
  if p_dados is null or p_dados='{}'::jsonb or p_dados-array['slug','titulo','nome_curto','descricao','codigo','categoria','ativo','acesso_gratuito','ordem','thumbnail_url','norma_originaria_referencia','norma_originaria_data','houve_alteracao_legislativa','ultima_alteracao_referencia','ultima_alteracao_data','situacao_atualizacao']<>'{}'::jsonb then raise exception using errcode='22023',message='Campos da lei invalidos.'; end if;
  select * into v_before from public.leis where id=p_lei_id for update;
  if not found then raise exception using errcode='P0002',message='Lei nao encontrada.'; end if;
  update public.leis set
    slug=case when p_dados?'slug' then p_dados->>'slug' else slug end,
    titulo=case when p_dados?'titulo' then pg_catalog.btrim(p_dados->>'titulo') else titulo end,
    nome_curto=case when p_dados?'nome_curto' then nullif(p_dados->>'nome_curto','') else nome_curto end,
    descricao=case when p_dados?'descricao' then nullif(p_dados->>'descricao','') else descricao end,
    codigo=case when p_dados?'codigo' then nullif(p_dados->>'codigo','') else codigo end,
    categoria=case when p_dados?'categoria' then nullif(p_dados->>'categoria','') else categoria end,
    ativo=case when p_dados?'ativo' then (p_dados->>'ativo')::boolean else ativo end,
    acesso_gratuito=case when p_dados?'acesso_gratuito' then (p_dados->>'acesso_gratuito')::boolean else acesso_gratuito end,
    ordem=case when p_dados?'ordem' then (p_dados->>'ordem')::integer else ordem end,
    thumbnail_url=case when p_dados?'thumbnail_url' then nullif(p_dados->>'thumbnail_url','') else thumbnail_url end,
    norma_originaria_referencia=case when p_dados?'norma_originaria_referencia' then nullif(p_dados->>'norma_originaria_referencia','') else norma_originaria_referencia end,
    norma_originaria_data=case when p_dados?'norma_originaria_data' then nullif(p_dados->>'norma_originaria_data','')::date else norma_originaria_data end,
    houve_alteracao_legislativa=case when p_dados?'houve_alteracao_legislativa' then (p_dados->>'houve_alteracao_legislativa')::boolean else houve_alteracao_legislativa end,
    ultima_alteracao_referencia=case when p_dados?'ultima_alteracao_referencia' then nullif(p_dados->>'ultima_alteracao_referencia','') else ultima_alteracao_referencia end,
    ultima_alteracao_data=case when p_dados?'ultima_alteracao_data' then nullif(p_dados->>'ultima_alteracao_data','')::date else ultima_alteracao_data end,
    situacao_atualizacao=case when p_dados?'situacao_atualizacao' then p_dados->>'situacao_atualizacao' else situacao_atualizacao end
  where id=p_lei_id returning * into v_after;
  perform public.admin_comercial_auditar(p_ator_user_id,'atualizar','lei',p_lei_id::text,pg_catalog.to_jsonb(v_before),pg_catalog.to_jsonb(v_after));
  return pg_catalog.to_jsonb(v_after);
end;
$function$;

create or replace function public.obter_minhas_leis()
returns table (id bigint,slug text,titulo text,nome_curto text,descricao text,codigo text,categoria text,thumbnail_url text,ordem integer,fontes_ativas bigint,total_flashcards bigint,versao_material text,revisado_em date,publicado_em date,situacao_atualizacao text,houve_alteracao_legislativa boolean,referencia_normativa_atual text,tipo_referencia_normativa text)
language sql stable security definer set search_path=pg_catalog as $function$
  with aluno_atual as (select id from public.alunos where user_id=auth.uid()), acessos as (
    select liberacao.lei_id,count(*)::bigint as fontes_ativas from public.liberacoes_leis liberacao join aluno_atual aluno on aluno.id=liberacao.aluno_id where liberacao.status='ativo' group by liberacao.lei_id
  ), visiveis as (
    select lei.id,coalesce(acessos.fontes_ativas,0::bigint) as fontes_ativas from public.leis lei left join acessos on acessos.lei_id=lei.id where lei.ativo=true and exists(select 1 from aluno_atual) and (lei.acesso_gratuito or acessos.lei_id is not null)
  )
  select lei.id,lei.slug,lei.titulo,lei.nome_curto,lei.descricao,lei.codigo,lei.categoria,lei.thumbnail_url,lei.ordem,visiveis.fontes_ativas,coalesce(totais.total_flashcards,0::bigint),vigente.versao_material,vigente.revisado_em,vigente.publicado_em,lei.situacao_atualizacao,lei.houve_alteracao_legislativa,case when lei.houve_alteracao_legislativa then lei.ultima_alteracao_referencia else lei.norma_originaria_referencia end,case when lei.houve_alteracao_legislativa then 'alteracao'::text else 'originaria'::text end
  from visiveis join public.leis lei on lei.id=visiveis.id
  left join lateral (select coalesce(sum(material.quantidade_itens),0)::bigint as total_flashcards from public.materiais_leis material where material.lei_id=lei.id and material.ativo=true and material.tipo='flashcards') totais on true
  left join lateral (select material.versao_material,material.revisado_em,material.publicado_em from public.materiais_leis material where material.lei_id=lei.id and material.ativo=true and material.tipo='flashcards' order by material.publicado_em desc nulls last,material.revisado_em desc nulls last,material.ordem,material.id desc limit 1) vigente on true
  order by lei.ordem,lei.titulo,lei.id;
$function$;

revoke all on function public.obter_minhas_leis() from public, anon, authenticated, service_role;
grant execute on function public.obter_minhas_leis() to authenticated;
commit;
