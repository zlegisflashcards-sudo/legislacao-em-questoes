begin;

-- Delimitadores evitam que uma variação curta altere o prefixo do nome já correto.
create or replace function public.admin_replace_complete_question_text(p_source text, p_find text, p_replace text)
returns text
language plpgsql
immutable
strict
set search_path = ''
as $function$
declare
  v_result text := '';
  v_cursor integer := 1;
  v_found integer;
  v_index integer;
  v_before text;
  v_after text;
begin
  loop
    v_found := pg_catalog.strpos(pg_catalog.substr(p_source, v_cursor), p_find);
    exit when v_found = 0;
    v_index := v_cursor + v_found - 1;
    v_before := case when v_index > 1 then pg_catalog.substr(p_source, v_index - 1, 1) else null end;
    v_after := pg_catalog.substr(p_source, v_index + pg_catalog.length(p_find), 1);
    v_result := v_result || pg_catalog.substr(p_source, v_cursor, v_index - v_cursor);
    if coalesce(v_before ~ '[[:alnum:]_/-]', false) or coalesce(v_after ~ '[[:alnum:]_/-]', false) then
      v_result := v_result || p_find;
    else
      v_result := v_result || p_replace;
    end if;
    v_cursor := v_index + pg_catalog.length(p_find);
  end loop;
  return v_result || pg_catalog.substr(p_source, v_cursor);
end;
$function$;

-- A substituição textual é transacional: a prévia enviada pelo cliente protege
-- contra uma edição concorrente e somente os campos de conteúdo podem ser alvo.
create or replace function public.admin_bulk_replace_law_question_text(
  p_lei_id bigint,
  p_question_ids uuid[],
  p_field text,
  p_find text,
  p_replace text,
  p_expected jsonb,
  p_actor_user_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_ids uuid[] := '{}'::uuid[];
  v_before jsonb := '[]'::jsonb;
  v_after jsonb := '[]'::jsonb;
  v_changed integer := 0;
begin
  if p_actor_user_id is null or not exists (select 1 from auth.users u where u.id = p_actor_user_id) then
    raise exception 'Autenticacao administrativa obrigatoria.' using errcode = '42501';
  end if;
  if p_field not in ('pergunta','justificativa','assunto','legislacao','titulo','capitulo','secao','subsecao','artigo') then
    raise exception 'Campo nao permitido para substituicao em lote.' using errcode = '22023';
  end if;
  if p_find is null or pg_catalog.btrim(p_find) = '' or pg_catalog.length(p_find) > 12000 or p_replace is null or pg_catalog.length(p_replace) > 60000 then
    raise exception 'Texto de substituicao invalido.' using errcode = '22023';
  end if;
  if p_question_ids is null or pg_catalog.cardinality(p_question_ids) = 0 or p_expected is null or pg_catalog.jsonb_typeof(p_expected) <> 'array' then
    raise exception 'Previa de substituicao em lote obrigatoria.' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(p_lei_id);
  if not exists (select 1 from public.leis l where l.id = p_lei_id) then
    raise exception 'Lei nao encontrada.' using errcode = 'P0002';
  end if;
  lock table public.questions in share row exclusive mode;

  select coalesce(pg_catalog.array_agg(q.id order by q.id), '{}'::uuid[])
    into v_ids
    from public.questions q
   where q.lei_id = p_lei_id and q.ativo and q.id = any(p_question_ids);
  if pg_catalog.cardinality(v_ids) <> pg_catalog.cardinality(p_question_ids)
    or pg_catalog.cardinality(v_ids) <> (select count(*) from pg_catalog.jsonb_array_elements(p_expected)) then
    raise exception 'A selecao mudou ou contem questao de outra lei. Gere uma nova previa.' using errcode = '40001';
  end if;
  if exists (
    select 1
      from public.questions q
      join pg_catalog.jsonb_to_recordset(p_expected) as e(id uuid, before jsonb) on e.id = q.id
     where q.id = any(v_ids)
       and coalesce((case p_field
          when 'pergunta' then pg_catalog.to_jsonb(q.pergunta)
          when 'justificativa' then pg_catalog.to_jsonb(q.justificativa)
          when 'assunto' then pg_catalog.to_jsonb(q.assunto)
          when 'legislacao' then pg_catalog.to_jsonb(q.legislacao)
          when 'titulo' then pg_catalog.to_jsonb(q.titulo)
          when 'capitulo' then pg_catalog.to_jsonb(q.capitulo)
          when 'secao' then pg_catalog.to_jsonb(q.secao)
          when 'subsecao' then pg_catalog.to_jsonb(q.subsecao)
          when 'artigo' then pg_catalog.to_jsonb(q.artigo)
        end), 'null'::jsonb) is distinct from e.before
  ) then
    raise exception 'As questoes foram alteradas desde a previa. Gere uma nova previa.' using errcode = '40001';
  end if;

  if p_field = 'pergunta' and exists (
    select 1 from public.questions q
     where q.id = any(v_ids)
       and public.admin_replace_complete_question_text(q.pergunta, p_find, p_replace) = ''
  ) then
    raise exception 'Pergunta nao pode ficar vazia.' using errcode = '22023';
  end if;
  if p_field in ('pergunta','justificativa','legislacao') and exists (
    select 1 from public.questions q
     where q.id = any(v_ids)
       and pg_catalog.length(public.admin_replace_complete_question_text(case p_field when 'pergunta' then q.pergunta when 'justificativa' then q.justificativa when 'legislacao' then q.legislacao end, p_find, p_replace)) > 60000
  ) then
    raise exception 'Conteudo excede o limite permitido.' using errcode = '22023';
  end if;
  if p_field in ('assunto','titulo','capitulo','secao','subsecao','artigo') and exists (
    select 1 from public.questions q
     where q.id = any(v_ids)
       and pg_catalog.length(public.admin_replace_complete_question_text(case p_field when 'assunto' then q.assunto when 'titulo' then q.titulo when 'capitulo' then q.capitulo when 'secao' then q.secao when 'subsecao' then q.subsecao when 'artigo' then q.artigo end, p_find, p_replace)) > 500
  ) then
    raise exception 'Texto excede o limite permitido.' using errcode = '22023';
  end if;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', q.id, 'before', case p_field
    when 'pergunta' then pg_catalog.to_jsonb(q.pergunta) when 'justificativa' then pg_catalog.to_jsonb(q.justificativa) when 'assunto' then pg_catalog.to_jsonb(q.assunto) when 'legislacao' then pg_catalog.to_jsonb(q.legislacao) when 'titulo' then pg_catalog.to_jsonb(q.titulo) when 'capitulo' then pg_catalog.to_jsonb(q.capitulo) when 'secao' then pg_catalog.to_jsonb(q.secao) when 'subsecao' then pg_catalog.to_jsonb(q.subsecao) when 'artigo' then pg_catalog.to_jsonb(q.artigo) end) order by q.id), '[]'::jsonb)
    into v_before from public.questions q where q.id = any(v_ids);

  update public.questions q set
    pergunta = case when p_field = 'pergunta' then pg_catalog.nullif(public.admin_replace_complete_question_text(q.pergunta, p_find, p_replace), '') else q.pergunta end,
    justificativa = case when p_field = 'justificativa' then pg_catalog.nullif(public.admin_replace_complete_question_text(q.justificativa, p_find, p_replace), '') else q.justificativa end,
    assunto = case when p_field = 'assunto' then pg_catalog.nullif(public.admin_replace_complete_question_text(q.assunto, p_find, p_replace), '') else q.assunto end,
    legislacao = case when p_field = 'legislacao' then pg_catalog.nullif(public.admin_replace_complete_question_text(q.legislacao, p_find, p_replace), '') else q.legislacao end,
    titulo = case when p_field = 'titulo' then pg_catalog.nullif(public.admin_replace_complete_question_text(q.titulo, p_find, p_replace), '') else q.titulo end,
    capitulo = case when p_field = 'capitulo' then pg_catalog.nullif(public.admin_replace_complete_question_text(q.capitulo, p_find, p_replace), '') else q.capitulo end,
    secao = case when p_field = 'secao' then pg_catalog.nullif(public.admin_replace_complete_question_text(q.secao, p_find, p_replace), '') else q.secao end,
    subsecao = case when p_field = 'subsecao' then pg_catalog.nullif(public.admin_replace_complete_question_text(q.subsecao, p_find, p_replace), '') else q.subsecao end,
    artigo = case when p_field = 'artigo' then pg_catalog.nullif(public.admin_replace_complete_question_text(q.artigo, p_find, p_replace), '') else q.artigo end,
    updated_at = pg_catalog.now()
   where q.id = any(v_ids)
     and (case p_field
       when 'pergunta' then q.pergunta when 'justificativa' then q.justificativa when 'assunto' then q.assunto when 'legislacao' then q.legislacao when 'titulo' then q.titulo when 'capitulo' then q.capitulo when 'secao' then q.secao when 'subsecao' then q.subsecao when 'artigo' then q.artigo end) is distinct from public.admin_replace_complete_question_text(case p_field
       when 'pergunta' then q.pergunta when 'justificativa' then q.justificativa when 'assunto' then q.assunto when 'legislacao' then q.legislacao when 'titulo' then q.titulo when 'capitulo' then q.capitulo when 'secao' then q.secao when 'subsecao' then q.subsecao when 'artigo' then q.artigo end, p_find, p_replace);
  get diagnostics v_changed = row_count;

  if p_field = 'pergunta' and exists (
    select 1 from public.questions q
    join public.questions other on other.lei_id = q.lei_id and other.ativo and other.id <> q.id and other.ordem = q.ordem and other.pergunta = q.pergunta
    where q.id = any(v_ids)
  ) then
    raise exception 'A substituicao criaria questoes duplicadas nesta lei.' using errcode = '23505';
  end if;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', q.id, 'after', case p_field
    when 'pergunta' then pg_catalog.to_jsonb(q.pergunta) when 'justificativa' then pg_catalog.to_jsonb(q.justificativa) when 'assunto' then pg_catalog.to_jsonb(q.assunto) when 'legislacao' then pg_catalog.to_jsonb(q.legislacao) when 'titulo' then pg_catalog.to_jsonb(q.titulo) when 'capitulo' then pg_catalog.to_jsonb(q.capitulo) when 'secao' then pg_catalog.to_jsonb(q.secao) when 'subsecao' then pg_catalog.to_jsonb(q.subsecao) when 'artigo' then pg_catalog.to_jsonb(q.artigo) end) order by q.id), '[]'::jsonb)
    into v_after from public.questions q where q.id = any(v_ids);

  insert into public.auditoria_administrativa(ator_user_id, acao, entidade, entidade_id, estado_anterior, estado_posterior, detalhes)
  values (p_actor_user_id, 'substituir_texto_lote', 'questao', p_lei_id::text, v_before, v_after, pg_catalog.jsonb_build_object('lei_id', p_lei_id, 'campo', p_field, 'localizar', p_find, 'substituir_por', p_replace, 'selecionadas', pg_catalog.cardinality(v_ids), 'alteradas', v_changed));

  return pg_catalog.jsonb_build_object('lei_id', p_lei_id, 'field', p_field, 'selected_count', pg_catalog.cardinality(v_ids), 'changed_count', v_changed);
end;
$function$;

revoke all on function public.admin_replace_complete_question_text(text,text,text) from public, anon, authenticated;
revoke all on function public.admin_bulk_replace_law_question_text(bigint,uuid[],text,text,text,jsonb,uuid) from public, anon, authenticated;
grant execute on function public.admin_bulk_replace_law_question_text(bigint,uuid[],text,text,text,jsonb,uuid) to service_role;

commit;
