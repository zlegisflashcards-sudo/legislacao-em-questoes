-- DRAFT LOCAL: não aplicar sem revisão e autorização de produção.
-- Extensão aditiva para disciplinas de doutrina; não altera RLS, grants ou dados existentes.
-- `leis` permanece o cadastro único de conteúdo: `tipo_conteudo` seleciona
-- legislação ou doutrina. Campos jurídicos de questions ficam nulos em doutrina.
begin;

alter table public.leis
  add column if not exists tipo_conteudo text not null default 'legislacao'
  check (tipo_conteudo in ('legislacao', 'doutrina'));

alter table public.law_structure
  drop constraint if exists law_structure_tipo_check;

alter table public.law_structure
  add constraint law_structure_tipo_check
  check (tipo in ('titulo', 'capitulo', 'secao', 'subsecao', 'estrutura'));

alter table public.questions
  add column if not exists resumo text,
  add column if not exists total_topicos integer check (total_topicos is null or total_topicos >= 0),
  add column if not exists fonte_referencia text,
  add column if not exists versao_fonte text;

create index if not exists questions_doctrine_topic_idx
  on public.questions (lei_id, ordem)
  where ativo = true;

-- RPC administrativa atômica (rascunho local). Recebe a prévia validada,
-- não escolhe UUID/assunto/estrutura e falha inteira em qualquer colisão.
create or replace function public.admin_importar_doutrina(
  p_ator_user_id uuid, p_slug text, p_titulo text, p_ordem integer, p_estruturas jsonb, p_questoes jsonb
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $function$
declare v_lei_id bigint; v_structure jsonb; v_question jsonb; v_structure_ids jsonb := '{}'::jsonb; v_structure_id bigint;
begin
  perform public.admin_comercial_validar_contexto(p_ator_user_id);
  if p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or pg_catalog.btrim(p_titulo) = '' or p_ordem < 0
     or jsonb_typeof(p_estruturas) <> 'array' or jsonb_typeof(p_questoes) <> 'array'
     or jsonb_array_length(p_estruturas) = 0 or jsonb_array_length(p_questoes) = 0 then
    raise exception using errcode='22023', message='Prévia de doutrina inválida.';
  end if;
  if exists (select 1 from public.leis where slug=p_slug) then raise exception using errcode='23505', message='Slug já cadastrado.'; end if;
  if exists (select 1 from jsonb_array_elements(p_questoes) q where not (q->>'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')) then
    raise exception using errcode='22023', message='UUID de doutrina inválido.';
  end if;
  if exists (select 1 from jsonb_array_elements_text(jsonb_path_query_array(p_questoes, '$[*].id')) id where exists (select 1 from public.questions where id=id::uuid)) then
    raise exception using errcode='23505', message='UUID de questão já cadastrado.';
  end if;
  insert into public.leis(slug,titulo,ordem,ativo,status_publicacao,tipo_conteudo)
  values(p_slug,pg_catalog.btrim(p_titulo),p_ordem,true,'inativa','doutrina') returning id into v_lei_id;
  for v_structure in select * from jsonb_array_elements(p_estruturas) loop
    insert into public.law_structure(lei_id,tipo,nome,ordem,ativo) values(v_lei_id,'estrutura',v_structure->>'nome',(v_structure->>'ordem')::integer,true) returning id into v_structure_id;
    v_structure_ids := v_structure_ids || jsonb_build_object(v_structure->>'key',v_structure_id);
  end loop;
  for v_question in select * from jsonb_array_elements(p_questoes) loop
    v_structure_id := (v_structure_ids->>(v_question->>'structureKey'))::bigint;
    if v_structure_id is null then raise exception using errcode='22023', message='Estrutura da questão inválida.'; end if;
    insert into public.questions(id,lei_id,structure_id,assunto,ordem,pergunta,resposta,justificativa,resumo,total_topicos,fonte_referencia,versao_fonte,legislacao,artigo,total_artigos,ativo)
    values((v_question->>'id')::uuid,v_lei_id,v_structure_id,v_question->>'assunto',v_question->>'ordem',v_question->>'pergunta',v_question->>'resposta',v_question->>'justificativa',nullif(v_question->>'resumo',''),(v_question->>'totalTopicos')::integer,nullif(v_question->>'fonteReferencia',''),nullif(v_question->>'versaoFonte',''),null,null,null,true);
  end loop;
  perform public.admin_comercial_auditar(p_ator_user_id,'importar','doutrina',v_lei_id::text,null,jsonb_build_object('slug',p_slug,'questoes',jsonb_array_length(p_questoes)));
  return jsonb_build_object('contentId',v_lei_id,'slug',p_slug,'questions',jsonb_array_length(p_questoes));
end;
$function$;
revoke all on function public.admin_importar_doutrina(uuid,text,text,integer,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.admin_importar_doutrina(uuid,text,text,integer,jsonb,jsonb) to service_role;

commit;
